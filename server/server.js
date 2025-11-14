/* eslint-disable */
'use strict';

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { bootstrap, getPool } = require('./db');

const app = express();
const server = http.createServer(app);

// WebSocket (Socket.IO) サーバー
// Nginxが /api/scheduleboard/socket.io/ を /socket.io/ にマップするため、
// サーバー側は /socket.io で待ち受ける
const io = new Server(server, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// WebSocket接続管理
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('[WebSocket] Client disconnected:', socket.id);
  });
  
  // クライアントからのデータ要求
  socket.on('request:refresh', () => {
    console.log('[WebSocket] Refresh requested by:', socket.id);
    socket.emit('data:refresh');
  });
});

// WebSocketでデータ変更を通知する関数
function broadcastDataChange(type, data) {
  const payload = { type, data, timestamp: new Date().toISOString() };
  console.log(`[WebSocket] 🔔 Broadcasting ${type} change:`, JSON.stringify(payload));
  io.emit('data:change', payload);
  console.log(`[WebSocket] ✅ Broadcast sent to ${io.sockets.sockets.size} connected clients`);
}

/* ===== 基本ミドルウェア ===== */
app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false })); // 必要に応じてCSPは後日チューニング
app.use(compression());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());

/* ===== DB 起動（非同期） ===== */
let ready = false;
bootstrap()
  .then(() => { ready = true; })
  .catch(err => {
    console.error('[DB bootstrap error]', err);
  });

/* ===== API ===== */
/* ★ ScheduleBoard専用API: /api/scheduleboard/* で提供 */
/* ★ 勤怠アプリ（kintai-backend）の /api/* とは完全に分離 */

// Health
app.get('/api/scheduleboard/health', async (_req, res) => {
  try {
    if (!ready) return res.json({ ok: true, service: 'scheduleboard', db: 'initializing' });
    const [rows] = await getPool().query('SELECT DATABASE() db, NOW() as now;');
    res.json({ ok: true, service: 'scheduleboard', db: rows[0].db, time: rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ユーティリティ（asyncハンドラ）
const asyncH = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch(e => {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  });

// groups
app.get('/api/scheduleboard/groups', asyncH(async (_req, res) => {
  const [rows] = await getPool().query('SELECT * FROM `groups` ORDER BY id;');
  res.json({ ok: true, groups: rows });
}));

app.post('/api/scheduleboard/groups', asyncH(async (req, res) => {
  const { name, color } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  const [r] = await getPool().query(
    'INSERT INTO `groups`(name, color) VALUES (?, ?);',
    [name, color || null]
  );
  res.json({ ok: true, id: r.insertId });
}));

// users
app.get('/api/scheduleboard/users', asyncH(async (_req, res) => {
  const [rows] = await getPool().query(
    'SELECT u.*, g.name AS group_name FROM users u LEFT JOIN `groups` g ON g.id=u.group_id ORDER BY u.id;'
  );
  res.json({ ok: true, users: rows });
}));

app.post('/api/scheduleboard/users', asyncH(async (req, res) => {
  const { code, name, email, group_id } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  const [r] = await getPool().query(
    'INSERT INTO users(code, name, email, group_id) VALUES (?, ?, ?, ?);',
    [code || null, name, email || null, group_id || null]
  );
  res.json({ ok: true, id: r.insertId });
}));

// templates
app.get('/api/scheduleboard/templates', asyncH(async (_req, res) => {
  const [rows] = await getPool().query('SELECT * FROM templates ORDER BY id;');
  res.json({ ok: true, templates: rows });
}));

app.post('/api/scheduleboard/templates', asyncH(async (req, res) => {
  const { title, description, color } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'title required' });
  const [r] = await getPool().query(
    'INSERT INTO templates(title, description, color) VALUES (?, ?, ?);',
    [title, description || null, color || null]
  );
  res.json({ ok: true, id: r.insertId });
}));

// events
app.get('/api/scheduleboard/events', asyncH(async (req, res) => {
  // Optional filters: user_id, from, to
  const { user_id, from, to } = req.query;
  const where = [];
  const params = [];
  if (user_id) { where.push('e.user_id = ?'); params.push(Number(user_id)); }
  if (from) { where.push('e.end_at >= ?'); params.push(from); }
  if (to) { where.push('e.start_at <= ?'); params.push(to); }
  const sql = `
    SELECT e.*, u.name AS user_name, t.title AS template_title
    FROM events e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN templates t ON t.id = e.template_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.start_at DESC, e.id DESC
  `;
  const [rows] = await getPool().query(sql, params);
  res.json({ ok: true, events: rows });
}));

app.post('/api/scheduleboard/events', asyncH(async (req, res) => {
  const { user_id, template_id, start_at, end_at, note } = req.body || {};
  if (!user_id || !start_at || !end_at) {
    return res.status(400).json({ ok: false, error: 'user_id, start_at, end_at required' });
  }
  const [r] = await getPool().query(
    'INSERT INTO events(user_id, template_id, start_at, end_at, note) VALUES (?, ?, ?, ?, ?);',
    [user_id, template_id || null, start_at, end_at, note || null]
  );
  res.json({ ok: true, id: r.insertId });
}));

/* ===== /admin エンドポイント追加 ===== */

// Admin Departments
app.get('/api/scheduleboard/admin/departments', asyncH(async (_req, res) => {
  const [rows] = await getPool().query('SELECT * FROM `groups` ORDER BY id;');
  res.json(rows);
}));

app.post('/api/scheduleboard/admin/departments', asyncH(async (req, res) => {
  const { name, color } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const [r] = await getPool().query(
    'INSERT INTO `groups`(name, color) VALUES (?, ?);',
    [name, color || null]
  );
  const result = { id: r.insertId, name, color };
  broadcastDataChange('department', result);
  res.json(result);
}));

app.get('/api/scheduleboard/admin/departments/:id', asyncH(async (req, res) => {
  const [rows] = await getPool().query('SELECT * FROM `groups` WHERE id = ?;', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

app.put('/api/scheduleboard/admin/departments/:id', asyncH(async (req, res) => {
  const { name, color } = req.body || {};
  await getPool().query('UPDATE `groups` SET name = ?, color = ? WHERE id = ?;', [name, color, req.params.id]);
  const result = { id: req.params.id, name, color };
  broadcastDataChange('department', result);
  res.json(result);
}));

app.delete('/api/scheduleboard/admin/departments/:id', asyncH(async (req, res) => {
  await getPool().query('DELETE FROM `groups` WHERE id = ?;', [req.params.id]);
  broadcastDataChange('department', { id: req.params.id, deleted: true });
  res.json({ ok: true });
}));

app.put('/api/scheduleboard/admin/departments/:id/move', asyncH(async (req, res) => {
  const { direction } = req.body || {};
  if (!direction || !['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }
  // 簡易実装: 実際の順序管理が必要な場合は display_order カラムを追加
  res.json({ ok: true, id: req.params.id, direction });
}));

app.put('/api/scheduleboard/admin/departments/order/update', asyncH(async (req, res) => {
  const { orders } = req.body || {};
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: 'orders must be an array' });
  }
  // 簡易実装: 実際の順序管理が必要な場合は display_order カラムを追加
  // 順序が変更されたことを通知
  broadcastDataChange('department', { type: 'order_updated', orders });
  res.json({ ok: true });
}));

// Admin Employees
app.get('/api/scheduleboard/admin/employees', asyncH(async (req, res) => {
  const { department_id } = req.query;
  let sql = 'SELECT u.id, u.code, u.name, u.email, u.group_id, u.group_id AS department_id, g.name AS department_name, u.created_at FROM users u LEFT JOIN `groups` g ON g.id=u.group_id';
  const params = [];
  
  if (department_id) {
    sql += ' WHERE u.group_id = ?';
    params.push(Number(department_id));
  }
  
  sql += ' ORDER BY u.id;';
  
  const [rows] = await getPool().query(sql, params);
  res.json(rows);
}));

app.post('/api/scheduleboard/admin/employees', asyncH(async (req, res) => {
  const { code, name, email, group_id, department_id } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const depId = department_id || group_id;
  const [r] = await getPool().query(
    'INSERT INTO users(code, name, email, group_id) VALUES (?, ?, ?, ?);',
    [code || null, name, email || null, depId || null]
  );
  const result = { id: r.insertId, code, name, email, department_id: depId };
  broadcastDataChange('employee', result);
  res.json(result);
}));

app.get('/api/scheduleboard/admin/employees/:id', asyncH(async (req, res) => {
  const [rows] = await getPool().query('SELECT * FROM users WHERE id = ?;', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

app.get('/api/scheduleboard/admin/employees/number/:employeeNumber', asyncH(async (req, res) => {
  const [rows] = await getPool().query('SELECT * FROM users WHERE code = ?;', [req.params.employeeNumber]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

app.put('/api/scheduleboard/admin/employees/:id', asyncH(async (req, res) => {
  const { code, name, email, group_id, department_id } = req.body || {};
  const depId = department_id !== undefined ? department_id : group_id;
  await getPool().query(
    'UPDATE users SET code = ?, name = ?, email = ?, group_id = ? WHERE id = ?;',
    [code, name, email, depId, req.params.id]
  );
  const result = { id: req.params.id, code, name, email, department_id: depId };
  broadcastDataChange('employee', result);
  res.json(result);
}));

app.delete('/api/scheduleboard/admin/employees/:id', asyncH(async (req, res) => {
  await getPool().query('DELETE FROM users WHERE id = ?;', [req.params.id]);
  broadcastDataChange('employee', { id: req.params.id, deleted: true });
  res.json({ ok: true });
}));

app.put('/api/scheduleboard/admin/employees/:id/move', asyncH(async (req, res) => {
  const { direction } = req.body || {};
  if (!direction || !['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }
  // 簡易実装: 実際の順序管理が必要な場合は display_order カラムを追加
  res.json({ ok: true, id: req.params.id, direction });
}));

app.put('/api/scheduleboard/admin/employees/order/update', asyncH(async (req, res) => {
  const { orders } = req.body || {};
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: 'orders must be an array' });
  }
  // 簡易実装: 実際の順序管理が必要な場合は display_order カラムを追加
  // 順序が変更されたことを通知
  broadcastDataChange('employee', { type: 'order_updated', orders });
  res.json({ ok: true });
}));

// Admin Schedules
app.get('/api/scheduleboard/admin/schedules', asyncH(async (req, res) => {
  const { employee_id, department_id, start_date, end_date, start, end } = req.query;
  const where = [];
  const params = [];
  
  if (employee_id) { where.push('e.user_id = ?'); params.push(Number(employee_id)); }
  if (department_id) { where.push('u.group_id = ?'); params.push(Number(department_id)); }
  
  const startTime = start_date || start;
  const endTime = end_date || end;
  // 日付範囲の比較を修正（重複チェック: start_at <= endTime AND end_at >= startTime）
  if (startTime && endTime) {
    where.push('e.start_at <= ? AND e.end_at >= ?');
    params.push(endTime, startTime);
  } else {
    if (startTime) { where.push('e.end_at >= ?'); params.push(startTime); }
    if (endTime) { where.push('e.start_at <= ?'); params.push(endTime); }
  }
  
  const sql = `
    SELECT e.*, u.name AS employee_name, u.code AS employee_code, u.group_id AS department_id, 
           t.title AS template_title, t.color AS template_color
    FROM events e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN templates t ON t.id = e.template_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY e.start_at, e.id
  `;
  const [rows] = await getPool().query(sql, params);
  // DATETIMEをJSTとして解釈してISO形式に変換
  const formattedRows = rows.map((row) => {
    // MySQLのDATETIMEはタイムゾーン情報がないので、JSTとして解釈
    // '2025-11-08 13:45:00' (JST) を UTC ISO '2025-11-08T04:45:00.000Z' に変換
    const formatDateTime = (dt) => {
      if (!dt) return null;
      // Dateオブジェクトの場合は文字列に変換
      let dtStr = dt;
      if (dt instanceof Date) {
        // MySQLのDATETIMEはJSTとして保存されているので、そのまま使用
        // DateオブジェクトをそのままISO文字列に変換（UTCとして扱う）
        return dt.toISOString();
      }
      if (typeof dt !== 'string') {
        dtStr = String(dt);
      }
      // DATETIME文字列をパース（JSTとして解釈）
      const [datePart, timePart] = dtStr.split(' ');
      if (!datePart || !timePart) return null;
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute, second] = timePart.split(':').map(Number);
      // MySQLのDATETIME（JST）をUTC ISOに変換
      // JST の時刻を UTC に変換: JST - 9時間 = UTC
      // 例: JST 13:45 -> UTC 04:45
      const jstDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
      // JSTとして解釈した時刻から9時間を引いてUTCに変換
      const utcTime = jstDate.getTime() - (9 * 60 * 60 * 1000);
      const utcDate = new Date(utcTime);
      return utcDate.toISOString();
    };
    return {
      ...row,
      employee_id: row.user_id, // user_idをemployee_idとしてマッピング
      start_datetime: formatDateTime(row.start_at),
      end_datetime: formatDateTime(row.end_at),
    };
  });
  res.json(formattedRows);
}));

app.post('/api/scheduleboard/admin/schedules', asyncH(async (req, res) => {
  const { employee_id, template_id, start_datetime, end_datetime, note, title, color } = req.body || {};
  const userId = employee_id;
  if (!userId || !start_datetime || !end_datetime) {
    return res.status(400).json({ error: 'employee_id, start_datetime, end_datetime required' });
  }
  // ISO 8601をMySQL DATETIME形式に変換（UTCをJSTに変換）
  const toMySQLDateTime = (isoString) => {
    if (!isoString) return null;
    // ISO文字列をDateオブジェクトに変換（UTCとして解釈）
    const utcDate = new Date(isoString);
    // JST（UTC+9）に変換: 9時間を追加
    const jstTime = utcDate.getTime() + (9 * 60 * 60 * 1000);
    const jstDate = new Date(jstTime);
    // MySQL DATETIME形式に変換（YYYY-MM-DD HH:mm:ss）
    // JST時刻を取得: 9時間追加後のUTC時刻をそのまま使用（UTCメソッドで正しい）
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    const hour = String(jstDate.getUTCHours()).padStart(2, '0');
    const minute = String(jstDate.getUTCMinutes()).padStart(2, '0');
    const second = String(jstDate.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  };
  const startAt = toMySQLDateTime(start_datetime);
  const endAt = toMySQLDateTime(end_datetime);
  
  const [r] = await getPool().query(
    'INSERT INTO events(user_id, template_id, start_at, end_at, note) VALUES (?, ?, ?, ?, ?);',
    [userId, template_id || null, startAt, endAt, note || title || null]
  );
  const result = { id: r.insertId, employee_id: userId, start_datetime, end_datetime, note };
  console.log(`[API] ✅ Schedule created: ID=${r.insertId}, employee_id=${userId}`);
  broadcastDataChange('schedule', result);
  res.json(result);
}));

app.get('/api/scheduleboard/admin/schedules/:id', asyncH(async (req, res) => {
  const [rows] = await getPool().query('SELECT * FROM events WHERE id = ?;', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

app.put('/api/scheduleboard/admin/schedules/:id', asyncH(async (req, res) => {
  const { employee_id, template_id, start_datetime, end_datetime, note } = req.body || {};
  
  // 既存のスケジュールを取得してuser_idを保持
  const [existingRows] = await getPool().query('SELECT user_id FROM events WHERE id = ?;', [req.params.id]);
  if (existingRows.length === 0) return res.status(404).json({ error: 'Schedule not found' });
  const userId = employee_id || existingRows[0].user_id;
  
  if (!userId) {
    return res.status(400).json({ error: 'employee_id is required' });
  }
  
  // ISO 8601をMySQL DATETIME形式に変換（UTCをJSTに変換）
  const toMySQLDateTime = (isoString) => {
    if (!isoString) return null;
    const utcDate = new Date(isoString);
    const jstTime = utcDate.getTime() + (9 * 60 * 60 * 1000);
    const jstDate = new Date(jstTime);
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    const hour = String(jstDate.getUTCHours()).padStart(2, '0');
    const minute = String(jstDate.getUTCMinutes()).padStart(2, '0');
    const second = String(jstDate.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  };
  
  // 更新するフィールドを動的に構築
  const updateFields = [];
  const updateValues = [];
  
  if (start_datetime !== undefined) {
    updateFields.push('start_at = ?');
    updateValues.push(toMySQLDateTime(start_datetime));
  }
  if (end_datetime !== undefined) {
    updateFields.push('end_at = ?');
    updateValues.push(toMySQLDateTime(end_datetime));
  }
  if (note !== undefined) {
    updateFields.push('note = ?');
    updateValues.push(note);
  }
  if (template_id !== undefined) {
    updateFields.push('template_id = ?');
    updateValues.push(template_id);
  }
  if (employee_id !== undefined) {
    updateFields.push('user_id = ?');
    updateValues.push(userId);
  }
  
  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  updateValues.push(req.params.id);
  
  await getPool().query(
    `UPDATE events SET ${updateFields.join(', ')} WHERE id = ?;`,
    updateValues
  );
  const result = { id: req.params.id, employee_id: userId, start_datetime, end_datetime };
  broadcastDataChange('schedule', result);
  res.json(result);
}));

app.delete('/api/scheduleboard/admin/schedules/:id', asyncH(async (req, res) => {
  await getPool().query('DELETE FROM events WHERE id = ?;', [req.params.id]);
  broadcastDataChange('schedule', { id: req.params.id, deleted: true });
  res.json({ ok: true });
}));

// スケジュールの月別取得（互換性のため、既存の /admin/schedules で対応可能）
app.get('/api/scheduleboard/admin/schedules/monthly/:employeeId/:year/:month', asyncH(async (req, res) => {
  const { employeeId, year, month } = req.params;
  // 月の範囲をJSTとして計算
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;
  const [rows] = await getPool().query(
    `SELECT e.*, u.name AS employee_name, u.code AS employee_code, u.group_id AS department_id
     FROM events e
     JOIN users u ON u.id = e.user_id
     WHERE e.user_id = ? AND e.start_at <= ? AND e.end_at >= ?
     ORDER BY e.start_at`,
    [employeeId, endDateStr, startDateStr]
  );
  // DATETIMEをJSTとして解釈してISO形式に変換
  const formattedRows = rows.map((row) => {
    const formatDateTime = (dt) => {
      if (!dt) return null;
      let dtStr = dt;
      if (dt instanceof Date) {
        return dt.toISOString();
      }
      if (typeof dt !== 'string') {
        dtStr = String(dt);
      }
      const [datePart, timePart] = dtStr.split(' ');
      if (!datePart || !timePart) return null;
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute, second] = timePart.split(':').map(Number);
      // MySQLのDATETIME（JST）をUTC ISOに変換
      const jstDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
      const utcTime = jstDate.getTime() - (9 * 60 * 60 * 1000);
      const utcDate = new Date(utcTime);
      return utcDate.toISOString();
    };
    return {
      ...row,
      employee_id: row.user_id, // user_idをemployee_idとしてマッピング
      title: row.note || row.template_title || '', // noteをtitleとしてマッピング、なければtemplate_title
      color: row.template_color || null, // template_colorをcolorとしてマッピング
      start_datetime: formatDateTime(row.start_at),
      end_datetime: formatDateTime(row.end_at),
    };
  });
  res.json(formattedRows);
}));

app.get('/api/scheduleboard/admin/schedules/monthly/department/:departmentId/:year/:month', asyncH(async (req, res) => {
  const { departmentId, year, month } = req.params;
  // 月の範囲をJSTとして計算
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;
  const [rows] = await getPool().query(
    `SELECT e.*, u.name AS employee_name, u.code AS employee_code, u.group_id AS department_id,
            t.title AS template_title, t.color AS template_color
     FROM events e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN templates t ON t.id = e.template_id
     WHERE u.group_id = ? AND e.start_at <= ? AND e.end_at >= ?
     ORDER BY e.start_at`,
    [departmentId, endDateStr, startDateStr]
  );
  // DATETIMEをJSTとして解釈してISO形式に変換
  const formattedRows = rows.map((row) => {
    const formatDateTime = (dt) => {
      if (!dt) return null;
      let dtStr = dt;
      if (dt instanceof Date) {
        return dt.toISOString();
      }
      if (typeof dt !== 'string') {
        dtStr = String(dt);
      }
      const [datePart, timePart] = dtStr.split(' ');
      if (!datePart || !timePart) return null;
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute, second] = timePart.split(':').map(Number);
      // MySQLのDATETIME（JST）をUTC ISOに変換
      const jstDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
      const utcTime = jstDate.getTime() - (9 * 60 * 60 * 1000);
      const utcDate = new Date(utcTime);
      return utcDate.toISOString();
    };
    return {
      ...row,
      employee_id: row.user_id, // user_idをemployee_idとしてマッピング
      title: row.note || row.template_title || '', // noteをtitleとしてマッピング、なければtemplate_title
      color: row.template_color || null, // template_colorをcolorとしてマッピング
      start_datetime: formatDateTime(row.start_at),
      end_datetime: formatDateTime(row.end_at),
    };
  });
  res.json(formattedRows);
}));

app.get('/api/scheduleboard/admin/schedules/monthly/all/:year/:month', asyncH(async (req, res) => {
  const { year, month } = req.params;
  // 月の範囲をJSTとして計算
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;
  const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;
  const [rows] = await getPool().query(
    `SELECT e.*, u.name AS employee_name, u.code AS employee_code, u.group_id AS department_id,
            t.title AS template_title, t.color AS template_color
     FROM events e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN templates t ON t.id = e.template_id
     WHERE e.start_at <= ? AND e.end_at >= ?
     ORDER BY e.start_at`,
    [endDateStr, startDateStr]
  );
  // DATETIMEをJSTとして解釈してISO形式に変換
  const formattedRows = rows.map((row) => {
    const formatDateTime = (dt) => {
      if (!dt) return null;
      let dtStr = dt;
      if (dt instanceof Date) {
        return dt.toISOString();
      }
      if (typeof dt !== 'string') {
        dtStr = String(dt);
      }
      const [datePart, timePart] = dtStr.split(' ');
      if (!datePart || !timePart) return null;
      const [y, m, d] = datePart.split('-').map(Number);
      const [h, min, sec] = timePart.split(':').map(Number);
      const jstDate = new Date(Date.UTC(y, m - 1, d, h, min, sec || 0));
      const utcTime = jstDate.getTime() - (9 * 60 * 60 * 1000);
      const utcDate = new Date(utcTime);
      return utcDate.toISOString();
    };
    return {
      ...row,
      employee_id: row.user_id, // user_idをemployee_idとしてマッピング
      title: row.note || row.template_title || '', // noteをtitleとしてマッピング、なければtemplate_title
      color: row.template_color || null, // template_colorをcolorとしてマッピング
      start_datetime: formatDateTime(row.start_at),
      end_datetime: formatDateTime(row.end_at),
    };
  });
  res.json(formattedRows);
}));

app.get('/api/scheduleboard/admin/schedules/daily/department/:departmentId/:date', asyncH(async (req, res) => {
  const { departmentId, date } = req.params;
  // 日付文字列（YYYY-MM-DD）をJSTとして解釈
  const [year, month, day] = date.split('-').map(Number);
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 00:00:00`;
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 23:59:59`;
  const [rows] = await getPool().query(
    `SELECT e.*, u.name AS employee_name, u.code AS employee_code, u.group_id AS department_id
     FROM events e
     JOIN users u ON u.id = e.user_id
     WHERE u.group_id = ? AND e.start_at <= ? AND e.end_at >= ?
     ORDER BY e.start_at`,
    [departmentId, endDateStr, startDateStr]
  );
  // DATETIMEをJSTとして解釈してISO形式に変換
  const formattedRows = rows.map((row) => {
    const formatDateTime = (dt) => {
      if (!dt) return null;
      let dtStr = dt;
      if (dt instanceof Date) {
        return dt.toISOString();
      }
      if (typeof dt !== 'string') {
        dtStr = String(dt);
      }
      const [datePart, timePart] = dtStr.split(' ');
      if (!datePart || !timePart) return null;
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute, second] = timePart.split(':').map(Number);
      // MySQLのDATETIME（JST）をUTC ISOに変換
      const jstDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
      const utcTime = jstDate.getTime() - (9 * 60 * 60 * 1000);
      const utcDate = new Date(utcTime);
      return utcDate.toISOString();
    };
    return {
      ...row,
      employee_id: row.user_id, // user_idをemployee_idとしてマッピング
      title: row.note || row.template_title || '', // noteをtitleとしてマッピング、なければtemplate_title
      color: row.template_color || null, // template_colorをcolorとしてマッピング
      start_datetime: formatDateTime(row.start_at),
      end_datetime: formatDateTime(row.end_at),
    };
  });
  res.json(formattedRows);
}));

// GET /admin/schedules/daily-all エンドポイント追加
app.get('/api/scheduleboard/admin/schedules/daily-all', asyncH(async (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'date parameter is required' });
  }
  // 日付文字列（YYYY-MM-DD）をJSTとして解釈して、その日の範囲を取得
  // JSTの00:00:00から23:59:59までをUTCに変換
  const [year, month, day] = date.split('-').map(Number);
  // JST 00:00:00 = UTC 前日15:00:00 (UTC-9時間)
  const jstStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - (9 * 60 * 60 * 1000));
  // JST 23:59:59 = UTC 当日14:59:59
  const jstEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59) - (9 * 60 * 60 * 1000));
  
  // MySQLのDATETIMEはJSTとして保存されているので、JSTの範囲で比較
  // ただし、比較用には文字列形式で渡す
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 00:00:00`;
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 23:59:59`;
  
  const [rows] = await getPool().query(
    `SELECT e.*, u.name AS employee_name, u.code AS employee_code, u.group_id AS department_id,
            t.title AS template_title, t.color AS template_color
     FROM events e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN templates t ON t.id = e.template_id
     WHERE e.start_at <= ? AND e.end_at >= ?
     ORDER BY e.start_at`,
    [endDateStr, startDateStr]
  );
  // DATETIMEをJSTとして解釈してISO形式に変換
  const formattedRows = rows.map((row) => {
    const formatDateTime = (dt) => {
      if (!dt) return null;
      let dtStr = dt;
      if (dt instanceof Date) {
        return dt.toISOString();
      }
      if (typeof dt !== 'string') {
        dtStr = String(dt);
      }
      const [datePart, timePart] = dtStr.split(' ');
      if (!datePart || !timePart) return null;
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute, second] = timePart.split(':').map(Number);
      // MySQLのDATETIME（JST）をUTC ISOに変換
      const jstDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second || 0));
      const utcTime = jstDate.getTime() - (9 * 60 * 60 * 1000);
      const utcDate = new Date(utcTime);
      return utcDate.toISOString();
    };
    return {
      ...row,
      employee_id: row.user_id, // user_idをemployee_idとしてマッピング
      title: row.note || row.template_title || '', // noteをtitleとしてマッピング、なければtemplate_title
      color: row.template_color || null, // template_colorをcolorとしてマッピング
      start_datetime: formatDateTime(row.start_at),
      end_datetime: formatDateTime(row.end_at),
    };
  });
  res.json(formattedRows);
}));

app.post('/api/scheduleboard/admin/schedules/:id/copy', asyncH(async (req, res) => {
  const { target_employee_id, target_start_datetime } = req.body || {};
  if (!target_employee_id || !target_start_datetime) {
    return res.status(400).json({ error: 'target_employee_id and target_start_datetime required' });
  }
  const [sourceRows] = await getPool().query('SELECT * FROM events WHERE id = ?;', [req.params.id]);
  if (sourceRows.length === 0) return res.status(404).json({ error: 'Source schedule not found' });
  const source = sourceRows[0];
  const duration = new Date(source.end_at) - new Date(source.start_at);
  const targetEnd = new Date(new Date(target_start_datetime).getTime() + duration);
  // ISO 8601をMySQL DATETIME形式に変換（UTCをJSTに変換）
  const toMySQLDateTime = (isoString) => {
    if (!isoString) return null;
    const utcDate = new Date(isoString);
    const jstTime = utcDate.getTime() + (9 * 60 * 60 * 1000);
    const jstDate = new Date(jstTime);
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    const hour = String(jstDate.getUTCHours()).padStart(2, '0');
    const minute = String(jstDate.getUTCMinutes()).padStart(2, '0');
    const second = String(jstDate.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  };
  const startAt = toMySQLDateTime(target_start_datetime);
  const endAt = toMySQLDateTime(targetEnd.toISOString());
  
  const [r] = await getPool().query(
    'INSERT INTO events(user_id, template_id, start_at, end_at, note) VALUES (?, ?, ?, ?, ?);',
    [target_employee_id, source.template_id, startAt, endAt, source.note]
  );
  const result = { id: r.insertId, employee_id: target_employee_id, start_datetime: target_start_datetime, end_datetime: targetEnd.toISOString() };
  broadcastDataChange('schedule', result);
  res.json(result);
}));

app.post('/api/scheduleboard/admin/schedules/check-conflict', asyncH(async (req, res) => {
  const { employee_id, start_datetime, end_datetime, exclude_id } = req.body || {};
  if (!employee_id || !start_datetime || !end_datetime) {
    return res.status(400).json({ error: 'employee_id, start_datetime, end_datetime required' });
  }
  const where = ['e.user_id = ?', 'e.end_at > ?', 'e.start_at < ?'];
  const params = [employee_id, start_datetime, end_datetime];
  if (exclude_id) {
    where.push('e.id != ?');
    params.push(exclude_id);
  }
  const [rows] = await getPool().query(
    `SELECT e.* FROM events e WHERE ${where.join(' AND ')}`,
    params
  );
  res.json({ hasConflict: rows.length > 0, conflicts: rows });
}));

// Admin Equipment
app.get('/api/scheduleboard/admin/equipment', asyncH(async (_req, res) => {
  // equipment テーブルがない場合は空配列を返す
  try {
    const [rows] = await getPool().query('SELECT * FROM equipment ORDER BY id;');
    res.json(rows);
  } catch (e) {
    res.json([]);
  }
}));

app.post('/api/scheduleboard/admin/equipment', asyncH(async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const [r] = await getPool().query(
    'INSERT INTO equipment(name, description) VALUES (?, ?);',
    [name, description || null]
  );
  const result = { id: r.insertId, name, description };
  broadcastDataChange('equipment', result);
  res.json(result);
}));

app.get('/api/scheduleboard/admin/equipment/:id', asyncH(async (req, res) => {
  try {
    const [rows] = await getPool().query('SELECT * FROM equipment WHERE id = ?;', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(404).json({ error: 'Not found' });
  }
}));

app.put('/api/scheduleboard/admin/equipment/:id', asyncH(async (req, res) => {
  const { name, description } = req.body || {};
  try {
    await getPool().query('UPDATE equipment SET name = ?, description = ? WHERE id = ?;', [name, description, req.params.id]);
    const result = { id: req.params.id, name, description };
    broadcastDataChange('equipment', result);
    res.json(result);
  } catch (e) {
    res.status(404).json({ error: 'Not found' });
  }
}));

app.delete('/api/scheduleboard/admin/equipment/:id', asyncH(async (req, res) => {
  try {
    await getPool().query('DELETE FROM equipment WHERE id = ?;', [req.params.id]);
    broadcastDataChange('equipment', { id: req.params.id, deleted: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(404).json({ error: 'Not found' });
  }
}));

app.put('/api/scheduleboard/admin/equipment/:id/move', asyncH(async (req, res) => {
  const { direction } = req.body || {};
  if (!direction || !['up', 'down'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be "up" or "down"' });
  }
  // 簡易実装: 実際の順序管理が必要な場合は display_order カラムを追加
  res.json({ ok: true, id: req.params.id, direction });
}));

app.put('/api/scheduleboard/admin/equipment/order/update', asyncH(async (req, res) => {
  const { orders } = req.body || {};
  if (!Array.isArray(orders)) {
    return res.status(400).json({ error: 'orders must be an array' });
  }
  // 簡易実装: 実際の順序管理が必要な場合は display_order カラムを追加
  // 順序が変更されたことを通知
  broadcastDataChange('equipment', { type: 'order_updated', orders });
  res.json({ ok: true });
}));

// Equipment Reservations
app.get('/api/scheduleboard/equipment-reservations', asyncH(async (req, res) => {
  try {
    const { equipment_id, start_date, end_date, date } = req.query;
    const where = [];
    const params = [];
    
    if (equipment_id) { 
      where.push('er.equipment_id = ?'); 
      params.push(Number(equipment_id)); 
    }
    
    // dateパラメータがある場合（日付指定）
    // JSTの日付で判定するため、JST文字列で直接比較
    // 開始日または終了日が指定日の範囲内にある予約を取得
    if (date) {
      // JST 00:00:00 から JST 23:59:59.999 の範囲をJST文字列として指定
      // DATETIMEはJST（ローカル時間）として保存されているため、JST文字列で比較
      const startJstStr = `${date} 00:00:00`;
      const endJstStr = `${date} 23:59:59`;
      // 予約の開始日時が指定日の終了時刻以前、かつ予約の終了日時が指定日の開始時刻以降
      where.push('(er.start_datetime <= ? AND er.end_datetime >= ?)');
      params.push(endJstStr, startJstStr);
    } else {
      // start_date/end_dateパラメータがある場合（範囲指定）
      if (start_date) { 
        where.push('er.end_datetime >= ?'); 
        params.push(start_date); 
      }
      if (end_date) { 
        where.push('er.start_datetime <= ?'); 
        params.push(end_date); 
      }
    }
    
    const sql = `
      SELECT 
        er.id, er.equipment_id, er.employee_id, er.title, er.note, er.color,
        DATE_FORMAT(er.start_datetime, '%Y-%m-%d %H:%i:%s') as start_datetime,
        DATE_FORMAT(er.end_datetime, '%Y-%m-%d %H:%i:%s') as end_datetime,
        er.created_at, er.updated_at,
        e.name AS equipment_name,
        u.name AS employee_name,
        u.code AS employee_code
      FROM equipment_reservations er
      LEFT JOIN equipment e ON e.id = er.equipment_id
      LEFT JOIN users u ON u.id = er.employee_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY er.start_datetime;
    `;
    console.log(`[API] Equipment reservations query - date: ${req.query.date}, WHERE: ${where.join(' AND ')}, params:`, params);
    const [rows] = await getPool().query(sql, params);
    console.log(`[API] Equipment reservations found: ${rows.length} rows`);
    
    // DATETIMEをISO形式に変換
    const formattedRows = rows.map((row) => {
      const formatDateTime = (dt) => {
        if (!dt) return null;
        if (dt instanceof Date) {
          // Dateオブジェクトの場合、JSTとして解釈してISO形式に変換
          const jstTime = dt.getTime() - (9 * 60 * 60 * 1000); // UTCに変換
          return new Date(jstTime).toISOString();
        }
        if (typeof dt === 'string') {
          // 'YYYY-MM-DD HH:mm:ss'形式をISO形式に変換
          // MySQLのDATETIMEはJST（ローカル時間）として解釈される
          // '2025-11-14 09:00:00' → JST 09:00 → UTC 00:00
          const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
          if (match) {
            const [, year, month, day, hour, minute, second] = match;
            // JSTとして解釈してUTCに変換
            const jstDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
            return jstDate.toISOString();
          }
          // フォールバック: 既存のロジック
          const date = new Date(dt + '+09:00');
          return date.toISOString();
        }
        return dt;
      };
      
      return {
        ...row,
        start_datetime: formatDateTime(row.start_datetime),
        end_datetime: formatDateTime(row.end_datetime),
      };
    });
    
    res.json(formattedRows);
  } catch (e) {
    console.error('[API] Equipment reservations fetch error:', e);
    res.json([]);
  }
}));

app.post('/api/scheduleboard/equipment-reservations', asyncH(async (req, res) => {
  const { equipment_id, employee_id, start_datetime, end_datetime, title, note, color } = req.body || {};
  if (!equipment_id || !start_datetime || !end_datetime) {
    return res.status(400).json({ error: 'equipment_id, start_datetime, end_datetime required' });
  }
  
  // ISO 8601をMySQL DATETIME形式に変換（ローカル時間として解釈）
  // フロントエンドから送られてくるISO文字列（例: "2025-11-14T09:00:00"）は
  // タイムゾーン情報がないため、ローカル時間（JST）として解釈する
  const toMySQLDateTime = (isoString) => {
    if (!isoString) return null;
    console.log(`[toMySQLDateTime] Input: "${isoString}"`);
    // タイムゾーン情報がない場合（Zや+09:00や-09:00がない場合）、ローカル時間として解釈
    // 末尾にZ、+HH:MM、-HH:MMのいずれもない場合
    if (!isoString.endsWith('Z') && !/[\+\-]\d{2}:\d{2}$/.test(isoString)) {
      // "YYYY-MM-DDTHH:mm:ss" 形式をパースしてローカル時間として扱う
      const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const result = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        console.log(`[toMySQLDateTime] No timezone, direct conversion: "${result}"`);
        return result;
      }
    }
    // タイムゾーン情報がある場合は、UTCとして解釈してJSTに変換
    console.log(`[toMySQLDateTime] Has timezone, converting UTC to JST`);
    const utcDate = new Date(isoString);
    const jstTime = utcDate.getTime() + (9 * 60 * 60 * 1000);
    const jstDate = new Date(jstTime);
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    const hour = String(jstDate.getUTCHours()).padStart(2, '0');
    const minute = String(jstDate.getUTCMinutes()).padStart(2, '0');
    const second = String(jstDate.getUTCSeconds()).padStart(2, '0');
    const result = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    console.log(`[toMySQLDateTime] UTC to JST result: "${result}"`);
    return result;
  };
  
  const startAt = toMySQLDateTime(start_datetime);
  const endAt = toMySQLDateTime(end_datetime);
  console.log(`[POST equipment-reservations] MySQL values: start="${startAt}", end="${endAt}"`);
  
  const [r] = await getPool().query(
    'INSERT INTO equipment_reservations(equipment_id, employee_id, title, start_datetime, end_datetime, note, color) VALUES (?, ?, ?, ?, ?, ?, ?);',
    [equipment_id, employee_id || null, title || note || '予約', startAt, endAt, note || null, color || '#3174ad']
  );
  
  // データベースから取得した値をISO形式に変換
  const formatDateTime = (dt) => {
    if (!dt) return null;
    console.log(`[formatDateTime] Input:`, dt, `Type: ${typeof dt}`);
    if (dt instanceof Date) {
      const jstTime = dt.getTime() - (9 * 60 * 60 * 1000);
      const result = new Date(jstTime).toISOString();
      console.log(`[formatDateTime] Date object -> UTC ISO: "${result}"`);
      return result;
    }
    if (typeof dt === 'string') {
      const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const jstDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
        const result = jstDate.toISOString();
        console.log(`[formatDateTime] String "${dt}" -> JST date -> UTC ISO: "${result}"`);
        return result;
      }
      const date = new Date(dt + '+09:00');
      const result = date.toISOString();
      console.log(`[formatDateTime] String (fallback) "${dt}" -> UTC ISO: "${result}"`);
      return result;
    }
    return dt;
  };
  
  // 作成した予約を取得してISO形式に変換
  // DATE_FORMATを使って文字列として取得し、タイムゾーン問題を回避
  const [created] = await getPool().query(
    `SELECT 
      id, equipment_id, employee_id, title, note, color,
      DATE_FORMAT(start_datetime, '%Y-%m-%d %H:%i:%s') as start_datetime,
      DATE_FORMAT(end_datetime, '%Y-%m-%d %H:%i:%s') as end_datetime,
      created_at, updated_at
    FROM equipment_reservations WHERE id = ?`,
    [r.insertId]
  );
  
  const createdReservation = created[0];
  console.log(`[POST equipment-reservations] DB returned (as string):`, {
    id: createdReservation.id,
    start_datetime: createdReservation.start_datetime,
    end_datetime: createdReservation.end_datetime
  });
  
  const formattedStart = formatDateTime(createdReservation.start_datetime);
  const formattedEnd = formatDateTime(createdReservation.end_datetime);
  console.log(`[POST equipment-reservations] Formatted values: start="${formattedStart}", end="${formattedEnd}"`);
  
  const result = { 
    id: r.insertId, 
    equipment_id, 
    employee_id, 
    title: title || note || '予約',
    start_datetime: formattedStart, 
    end_datetime: formattedEnd, 
    note,
    color: color || '#3174ad'
  };
  
  broadcastDataChange('equipment_reservation', result);
  res.json(result);
}));

app.put('/api/scheduleboard/equipment-reservations/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const { equipment_id, employee_id, start_datetime, end_datetime, title, note, color } = req.body || {};
  
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  
  // 既存予約の確認
  const [existing] = await getPool().query(
    'SELECT * FROM equipment_reservations WHERE id = ?',
    [id]
  );
  
  if (!existing || existing.length === 0) {
    return res.status(404).json({ error: 'Reservation not found' });
  }
  
  const reservation = existing[0];
  
  // 部分更新対応：既存データとマージ
  const merged = {
    equipment_id: equipment_id ?? reservation.equipment_id,
    employee_id: employee_id ?? reservation.employee_id,
    title: title ?? note ?? reservation.title ?? reservation.note ?? '予約',
    start_datetime: start_datetime ?? reservation.start_datetime,
    end_datetime: end_datetime ?? reservation.end_datetime,
    note: note ?? reservation.note,
    color: color ?? reservation.color ?? '#3174ad'
  };
  
  // ISO 8601をMySQL DATETIME形式に変換（ローカル時間として解釈）
  // フロントエンドから送られてくるISO文字列（例: "2025-11-14T09:00:00"）は
  // タイムゾーン情報がないため、ローカル時間（JST）として解釈する
  const toMySQLDateTime = (isoString) => {
    if (!isoString) return null;
    // タイムゾーン情報がない場合（Zや+09:00や-09:00がない場合）、ローカル時間として解釈
    // 末尾にZ、+HH:MM、-HH:MMのいずれもない場合
    if (!isoString.endsWith('Z') && !/[\+\-]\d{2}:\d{2}$/.test(isoString)) {
      // "YYYY-MM-DDTHH:mm:ss" 形式をパースしてローカル時間として扱う
      const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const result = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        return result;
      }
    }
    // タイムゾーン情報がある場合は、UTCとして解釈してJSTに変換
    const utcDate = new Date(isoString);
    const jstTime = utcDate.getTime() + (9 * 60 * 60 * 1000);
    const jstDate = new Date(jstTime);
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    const hour = String(jstDate.getUTCHours()).padStart(2, '0');
    const minute = String(jstDate.getUTCMinutes()).padStart(2, '0');
    const second = String(jstDate.getUTCSeconds()).padStart(2, '0');
    const result = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    return result;
  };
  
  const startAt = toMySQLDateTime(merged.start_datetime);
  const endAt = toMySQLDateTime(merged.end_datetime);
  
  if (!startAt || !endAt) {
    return res.status(400).json({ error: 'start_datetime and end_datetime required' });
  }
  
  await getPool().query(
    'UPDATE equipment_reservations SET equipment_id = ?, employee_id = ?, title = ?, start_datetime = ?, end_datetime = ?, note = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [merged.equipment_id, merged.employee_id || null, merged.title, startAt, endAt, merged.note || null, merged.color, id]
  );
  
  // 更新後のデータを取得（DATE_FORMATで文字列として取得）
  const [updated] = await getPool().query(
    `SELECT 
      id, equipment_id, employee_id, title, note, color,
      DATE_FORMAT(start_datetime, '%Y-%m-%d %H:%i:%s') as start_datetime,
      DATE_FORMAT(end_datetime, '%Y-%m-%d %H:%i:%s') as end_datetime,
      created_at, updated_at
    FROM equipment_reservations WHERE id = ?`,
    [id]
  );
  
  if (!updated || updated.length === 0) {
    return res.status(404).json({ error: 'Reservation not found after update' });
  }
  
  const updatedReservation = updated[0];
  
  // DATETIMEをISO形式に変換
  const formatDateTime = (dt) => {
    if (!dt) return null;
    if (dt instanceof Date) {
      const jstTime = dt.getTime() - (9 * 60 * 60 * 1000);
      return new Date(jstTime).toISOString();
    }
    if (typeof dt === 'string') {
      // 'YYYY-MM-DD HH:mm:ss'形式をISO形式に変換
      // MySQLのDATETIMEはJST（ローカル時間）として解釈される
      const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        // JSTとして解釈してUTCに変換
        const jstDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
        return jstDate.toISOString();
      }
      // フォールバック: 既存のロジック
      const date = new Date(dt + '+09:00');
      return date.toISOString();
    }
    return dt;
  };
  
  const result = {
    ...updatedReservation,
    start_datetime: formatDateTime(updatedReservation.start_datetime),
    end_datetime: formatDateTime(updatedReservation.end_datetime),
  };
  
  console.log(`[API] ✅ Equipment reservation updated: ID=${id}`);
  broadcastDataChange('equipment_reservation', result);
  res.json(result);
}));

app.delete('/api/scheduleboard/equipment-reservations/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  
  // 既存予約の確認
  const [existing] = await getPool().query(
    'SELECT * FROM equipment_reservations WHERE id = ?',
    [id]
  );
  
  if (!existing || existing.length === 0) {
    return res.status(404).json({ error: 'Reservation not found' });
  }
  
  await getPool().query(
    'DELETE FROM equipment_reservations WHERE id = ?',
    [id]
  );
  
  console.log(`[API] ✅ Equipment reservation deleted: ID=${id}`);
  broadcastDataChange('equipment_reservation', { id, deleted: true });
  res.json({ id, deleted: true });
}));

// Vehicle Reservations (車両予約 - 設備予約と同じ構造)
app.get('/api/scheduleboard/vehicle-reservations', asyncH(async (req, res) => {
  try {
    const { vehicle_id, start_date, end_date, date } = req.query;
    const where = [];
    const params = [];
    
    if (vehicle_id) { 
      where.push('vr.vehicle_id = ?'); 
      params.push(Number(vehicle_id)); 
    }
    
    // dateパラメータがある場合（日付指定）
    // JSTの日付で判定するため、JST文字列で直接比較
    // 開始日または終了日が指定日の範囲内にある予約を取得
    if (date) {
      // JST 00:00:00 から JST 23:59:59.999 の範囲をJST文字列として指定
      // DATETIMEはJST（ローカル時間）として保存されているため、JST文字列で比較
      const startJstStr = `${date} 00:00:00`;
      const endJstStr = `${date} 23:59:59`;
      // 予約の開始日時が指定日の終了時刻以前、かつ予約の終了日時が指定日の開始時刻以降
      where.push('(vr.start_datetime <= ? AND vr.end_datetime >= ?)');
      params.push(endJstStr, startJstStr);
    } else {
      // start_date/end_dateパラメータがある場合（範囲指定）
      if (start_date) { 
        where.push('vr.end_datetime >= ?'); 
        params.push(start_date); 
      }
      if (end_date) { 
        where.push('vr.start_datetime <= ?'); 
        params.push(end_date); 
      }
    }
    
    const sql = `
      SELECT 
        vr.id, vr.vehicle_id, vr.employee_id, vr.title, vr.note, vr.color,
        DATE_FORMAT(vr.start_datetime, '%Y-%m-%d %H:%i:%s') as start_datetime,
        DATE_FORMAT(vr.end_datetime, '%Y-%m-%d %H:%i:%s') as end_datetime,
        vr.created_at, vr.updated_at,
        e.name AS vehicle_name,
        u.name AS employee_name,
        u.code AS employee_code
      FROM vehicle_reservations vr
      LEFT JOIN equipment e ON e.id = vr.vehicle_id
      LEFT JOIN users u ON u.id = vr.employee_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY vr.start_datetime;
    `;
    console.log(`[API] Vehicle reservations query - date: ${req.query.date}, WHERE: ${where.join(' AND ')}, params:`, params);
    const [rows] = await getPool().query(sql, params);
    console.log(`[API] Vehicle reservations found: ${rows.length} rows`);
    
    // DATETIMEをISO形式に変換
    const formattedRows = rows.map((row) => {
      const formatDateTime = (dt) => {
        if (!dt) return null;
        if (dt instanceof Date) {
          // Dateオブジェクトの場合、JSTとして解釈してISO形式に変換
          const jstTime = dt.getTime() - (9 * 60 * 60 * 1000); // UTCに変換
          return new Date(jstTime).toISOString();
        }
        if (typeof dt === 'string') {
          // 'YYYY-MM-DD HH:mm:ss'形式をISO形式に変換
          // MySQLのDATETIMEはJST（ローカル時間）として解釈される
          // '2025-11-14 09:00:00' → JST 09:00 → UTC 00:00
          const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
          if (match) {
            const [, year, month, day, hour, minute, second] = match;
            // JSTとして解釈してUTCに変換
            const jstDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
            return jstDate.toISOString();
          }
          // フォールバック: 既存のロジック
          const date = new Date(dt + '+09:00');
          return date.toISOString();
        }
        return dt;
      };
      
      return {
        ...row,
        equipment_id: row.vehicle_id, // フロントエンドとの互換性のため
        vehicle_id: row.vehicle_id,
        equipment_name: row.vehicle_name, // フロントエンドとの互換性のため
        vehicle_name: row.vehicle_name,
        start_datetime: formatDateTime(row.start_datetime),
        end_datetime: formatDateTime(row.end_datetime),
      };
    });
    
    res.json(formattedRows);
  } catch (e) {
    console.error('[API] Vehicle reservations fetch error:', e);
    res.json([]);
  }
}));

app.post('/api/scheduleboard/vehicle-reservations', asyncH(async (req, res) => {
  const { vehicle_id, equipment_id, employee_id, start_datetime, end_datetime, title, note, color } = req.body || {};
  // vehicle_idまたはequipment_idのいずれかを受け入れる（互換性のため）
  const finalVehicleId = vehicle_id || equipment_id;
  if (!finalVehicleId || !start_datetime || !end_datetime) {
    return res.status(400).json({ error: 'vehicle_id (or equipment_id), start_datetime, end_datetime required' });
  }
  
  // ISO 8601をMySQL DATETIME形式に変換（ローカル時間として解釈）
  // フロントエンドから送られてくるISO文字列（例: "2025-11-14T09:00:00"）は
  // タイムゾーン情報がないため、ローカル時間（JST）として解釈する
  const toMySQLDateTime = (isoString) => {
    if (!isoString) return null;
    console.log(`[toMySQLDateTime] Input: "${isoString}"`);
    // タイムゾーン情報がない場合（Zや+09:00や-09:00がない場合）、ローカル時間として解釈
    // 末尾にZ、+HH:MM、-HH:MMのいずれもない場合
    if (!isoString.endsWith('Z') && !/[\+\-]\d{2}:\d{2}$/.test(isoString)) {
      // "YYYY-MM-DDTHH:mm:ss" 形式をパースしてローカル時間として扱う
      const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const result = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        console.log(`[toMySQLDateTime] No timezone, direct conversion: "${result}"`);
        return result;
      }
    }
    // タイムゾーン情報がある場合は、UTCとして解釈してJSTに変換
    console.log(`[toMySQLDateTime] Has timezone, converting UTC to JST`);
    const utcDate = new Date(isoString);
    const jstTime = utcDate.getTime() + (9 * 60 * 60 * 1000);
    const jstDate = new Date(jstTime);
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    const hour = String(jstDate.getUTCHours()).padStart(2, '0');
    const minute = String(jstDate.getUTCMinutes()).padStart(2, '0');
    const second = String(jstDate.getUTCSeconds()).padStart(2, '0');
    const result = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    console.log(`[toMySQLDateTime] UTC to JST result: "${result}"`);
    return result;
  };
  
  const startAt = toMySQLDateTime(start_datetime);
  const endAt = toMySQLDateTime(end_datetime);
  console.log(`[POST vehicle-reservations] MySQL values: start="${startAt}", end="${endAt}"`);
  
  const [r] = await getPool().query(
    'INSERT INTO vehicle_reservations(vehicle_id, employee_id, title, start_datetime, end_datetime, note, color) VALUES (?, ?, ?, ?, ?, ?, ?);',
    [finalVehicleId, employee_id || null, title || note || '予約', startAt, endAt, note || null, color || '#3174ad']
  );
  
  // データベースから取得した値をISO形式に変換
  const formatDateTime = (dt) => {
    if (!dt) return null;
    console.log(`[formatDateTime] Input:`, dt, `Type: ${typeof dt}`);
    if (dt instanceof Date) {
      const jstTime = dt.getTime() - (9 * 60 * 60 * 1000);
      const result = new Date(jstTime).toISOString();
      console.log(`[formatDateTime] Date object -> UTC ISO: "${result}"`);
      return result;
    }
    if (typeof dt === 'string') {
      const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const jstDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
        const result = jstDate.toISOString();
        console.log(`[formatDateTime] String "${dt}" -> JST date -> UTC ISO: "${result}"`);
        return result;
      }
      const date = new Date(dt + '+09:00');
      const result = date.toISOString();
      console.log(`[formatDateTime] String (fallback) "${dt}" -> UTC ISO: "${result}"`);
      return result;
    }
    return dt;
  };
  
  // 作成した予約を取得してISO形式に変換
  // DATE_FORMATを使って文字列として取得し、タイムゾーン問題を回避
  const [created] = await getPool().query(
    `SELECT 
      id, vehicle_id, employee_id, title, note, color,
      DATE_FORMAT(start_datetime, '%Y-%m-%d %H:%i:%s') as start_datetime,
      DATE_FORMAT(end_datetime, '%Y-%m-%d %H:%i:%s') as end_datetime,
      created_at, updated_at
    FROM vehicle_reservations WHERE id = ?`,
    [r.insertId]
  );
  
  const createdReservation = created[0];
  console.log(`[POST vehicle-reservations] DB returned (as string):`, {
    id: createdReservation.id,
    start_datetime: createdReservation.start_datetime,
    end_datetime: createdReservation.end_datetime
  });
  
  const formattedStart = formatDateTime(createdReservation.start_datetime);
  const formattedEnd = formatDateTime(createdReservation.end_datetime);
  console.log(`[POST vehicle-reservations] Formatted values: start="${formattedStart}", end="${formattedEnd}"`);
  
  const result = { 
    id: r.insertId, 
    vehicle_id: finalVehicleId,
    equipment_id: finalVehicleId, // フロントエンドとの互換性のため
    employee_id, 
    title: title || note || '予約',
    start_datetime: formattedStart, 
    end_datetime: formattedEnd, 
    note,
    color: color || '#3174ad'
  };
  
  broadcastDataChange('vehicle_reservation', result);
  res.json(result);
}));

app.put('/api/scheduleboard/vehicle-reservations/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const { vehicle_id, equipment_id, employee_id, start_datetime, end_datetime, title, note, color } = req.body || {};
  // vehicle_idまたはequipment_idのいずれかを受け入れる（互換性のため）
  const finalVehicleId = vehicle_id || equipment_id;
  
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  
  // 既存予約の確認
  const [existing] = await getPool().query(
    'SELECT * FROM vehicle_reservations WHERE id = ?',
    [id]
  );
  
  if (!existing || existing.length === 0) {
    return res.status(404).json({ error: 'Reservation not found' });
  }
  
  const reservation = existing[0];
  
  // 部分更新対応：既存データとマージ
  const merged = {
    vehicle_id: finalVehicleId ?? reservation.vehicle_id,
    employee_id: employee_id ?? reservation.employee_id,
    title: title ?? note ?? reservation.title ?? reservation.note ?? '予約',
    start_datetime: start_datetime ?? reservation.start_datetime,
    end_datetime: end_datetime ?? reservation.end_datetime,
    note: note ?? reservation.note,
    color: color ?? reservation.color ?? '#3174ad'
  };
  
  // ISO 8601をMySQL DATETIME形式に変換（ローカル時間として解釈）
  // フロントエンドから送られてくるISO文字列（例: "2025-11-14T09:00:00"）は
  // タイムゾーン情報がないため、ローカル時間（JST）として解釈する
  const toMySQLDateTime = (isoString) => {
    if (!isoString) return null;
    // タイムゾーン情報がない場合（Zや+09:00や-09:00がない場合）、ローカル時間として解釈
    // 末尾にZ、+HH:MM、-HH:MMのいずれもない場合
    if (!isoString.endsWith('Z') && !/[\+\-]\d{2}:\d{2}$/.test(isoString)) {
      // "YYYY-MM-DDTHH:mm:ss" 形式をパースしてローカル時間として扱う
      const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        const result = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        return result;
      }
    }
    // タイムゾーン情報がある場合は、UTCとして解釈してJSTに変換
    const utcDate = new Date(isoString);
    const jstTime = utcDate.getTime() + (9 * 60 * 60 * 1000);
    const jstDate = new Date(jstTime);
    const year = jstDate.getUTCFullYear();
    const month = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(jstDate.getUTCDate()).padStart(2, '0');
    const hour = String(jstDate.getUTCHours()).padStart(2, '0');
    const minute = String(jstDate.getUTCMinutes()).padStart(2, '0');
    const second = String(jstDate.getUTCSeconds()).padStart(2, '0');
    const result = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    return result;
  };
  
  const startAt = toMySQLDateTime(merged.start_datetime);
  const endAt = toMySQLDateTime(merged.end_datetime);
  
  if (!startAt || !endAt) {
    return res.status(400).json({ error: 'start_datetime and end_datetime required' });
  }
  
  await getPool().query(
    'UPDATE vehicle_reservations SET vehicle_id = ?, employee_id = ?, title = ?, start_datetime = ?, end_datetime = ?, note = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [merged.vehicle_id, merged.employee_id || null, merged.title, startAt, endAt, merged.note || null, merged.color, id]
  );
  
  // 更新後のデータを取得（DATE_FORMATで文字列として取得）
  const [updated] = await getPool().query(
    `SELECT 
      id, vehicle_id, employee_id, title, note, color,
      DATE_FORMAT(start_datetime, '%Y-%m-%d %H:%i:%s') as start_datetime,
      DATE_FORMAT(end_datetime, '%Y-%m-%d %H:%i:%s') as end_datetime,
      created_at, updated_at
    FROM vehicle_reservations WHERE id = ?`,
    [id]
  );
  
  if (!updated || updated.length === 0) {
    return res.status(404).json({ error: 'Reservation not found after update' });
  }
  
  const updatedReservation = updated[0];
  
  // DATETIMEをISO形式に変換
  const formatDateTime = (dt) => {
    if (!dt) return null;
    if (dt instanceof Date) {
      const jstTime = dt.getTime() - (9 * 60 * 60 * 1000);
      return new Date(jstTime).toISOString();
    }
    if (typeof dt === 'string') {
      // 'YYYY-MM-DD HH:mm:ss'形式をISO形式に変換
      // MySQLのDATETIMEはJST（ローカル時間）として解釈される
      const match = dt.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, year, month, day, hour, minute, second] = match;
        // JSTとして解釈してUTCに変換
        const jstDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
        return jstDate.toISOString();
      }
      // フォールバック: 既存のロジック
      const date = new Date(dt + '+09:00');
      return date.toISOString();
    }
    return dt;
  };
  
  const result = {
    ...updatedReservation,
    equipment_id: updatedReservation.vehicle_id, // フロントエンドとの互換性のため
    start_datetime: formatDateTime(updatedReservation.start_datetime),
    end_datetime: formatDateTime(updatedReservation.end_datetime),
  };
  
  console.log(`[API] ✅ Vehicle reservation updated: ID=${id}`);
  broadcastDataChange('vehicle_reservation', result);
  res.json(result);
}));

app.delete('/api/scheduleboard/vehicle-reservations/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  
  // 既存予約の確認
  const [existing] = await getPool().query(
    'SELECT * FROM vehicle_reservations WHERE id = ?',
    [id]
  );
  
  if (!existing || existing.length === 0) {
    return res.status(404).json({ error: 'Reservation not found' });
  }
  
  await getPool().query(
    'DELETE FROM vehicle_reservations WHERE id = ?',
    [id]
  );
  
  console.log(`[API] ✅ Vehicle reservation deleted: ID=${id}`);
  broadcastDataChange('vehicle_reservation', { id, deleted: true });
  res.json({ id, deleted: true });
}));

// Holidays API
app.get('/api/scheduleboard/holidays/:year', asyncH(async (req, res) => {
  const { year } = req.params;
  const yearNum = parseInt(year, 10);
  
  // 日本の祝日データ
  const HOLIDAYS_2024 = [
    { date: '2024-01-01', name: '元日' },
    { date: '2024-01-08', name: '成人の日' },
    { date: '2024-02-11', name: '建国記念の日' },
    { date: '2024-02-12', name: '振替休日' },
    { date: '2024-02-23', name: '天皇誕生日' },
    { date: '2024-03-20', name: '春分の日' },
    { date: '2024-04-29', name: '昭和の日' },
    { date: '2024-05-03', name: '憲法記念日' },
    { date: '2024-05-04', name: 'みどりの日' },
    { date: '2024-05-05', name: 'こどもの日' },
    { date: '2024-05-06', name: '振替休日' },
    { date: '2024-07-15', name: '海の日' },
    { date: '2024-08-11', name: '山の日' },
    { date: '2024-08-12', name: '振替休日' },
    { date: '2024-09-16', name: '敬老の日' },
    { date: '2024-09-22', name: '秋分の日' },
    { date: '2024-09-23', name: '振替休日' },
    { date: '2024-10-14', name: 'スポーツの日' },
    { date: '2024-11-03', name: '文化の日' },
    { date: '2024-11-04', name: '振替休日' },
    { date: '2024-11-23', name: '勤労感謝の日' }
  ];

  const HOLIDAYS_2025 = [
    { date: '2025-01-01', name: '元日' },
    { date: '2025-01-13', name: '成人の日' },
    { date: '2025-02-11', name: '建国記念の日' },
    { date: '2025-02-23', name: '天皇誕生日' },
    { date: '2025-02-24', name: '振替休日' },
    { date: '2025-03-21', name: '春分の日' },
    { date: '2025-04-29', name: '昭和の日' },
    { date: '2025-05-03', name: '憲法記念日' },
    { date: '2025-05-04', name: 'みどりの日' },
    { date: '2025-05-05', name: 'こどもの日' },
    { date: '2025-05-06', name: '振替休日' },
    { date: '2025-07-21', name: '海の日' },
    { date: '2025-08-11', name: '山の日' },
    { date: '2025-09-15', name: '敬老の日' },
    { date: '2025-09-23', name: '秋分の日' },
    { date: '2025-10-13', name: 'スポーツの日' },
    { date: '2025-11-03', name: '文化の日' },
    { date: '2025-11-23', name: '勤労感謝の日' },
    { date: '2025-11-24', name: '振替休日' }
  ];

  const HOLIDAYS_2026 = [
    { date: '2026-01-01', name: '元日' },
    { date: '2026-01-12', name: '成人の日' },
    { date: '2026-02-11', name: '建国記念の日' },
    { date: '2026-02-23', name: '天皇誕生日' },
    { date: '2026-03-20', name: '春分の日' },
    { date: '2026-04-29', name: '昭和の日' },
    { date: '2026-05-03', name: '憲法記念日' },
    { date: '2026-05-04', name: 'みどりの日' },
    { date: '2026-05-05', name: 'こどもの日' },
    { date: '2026-05-06', name: '振替休日' },
    { date: '2026-07-20', name: '海の日' },
    { date: '2026-08-11', name: '山の日' },
    { date: '2026-09-21', name: '敬老の日' },
    { date: '2026-09-22', name: '秋分の日' },
    { date: '2026-09-23', name: '振替休日' },
    { date: '2026-10-12', name: 'スポーツの日' },
    { date: '2026-11-03', name: '文化の日' },
    { date: '2026-11-23', name: '勤労感謝の日' }
  ];

  let holidays = [];
  if (yearNum === 2024) {
    holidays = HOLIDAYS_2024;
  } else if (yearNum === 2025) {
    holidays = HOLIDAYS_2025;
  } else if (yearNum === 2026) {
    holidays = HOLIDAYS_2026;
  }
  
  res.json(holidays);
}));

// ScheduleBoard API 404 guard
app.use('/api/scheduleboard', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

/* ===== フロント配信（/scheduleboard 配下） ===== */
const clientDir = path.join(__dirname, '..', 'suke', 'dist');

// 旧パス /shuke-b は /scheduleboard に恒久リダイレクト（任意）
app.get(['/shuke-b', '/shuke-b/*'], (_req, res) => {
  const to = _req.originalUrl.replace(/^\/shuke-b/, '/scheduleboard');
  res.redirect(301, to);
});

// アセットは長期キャッシュ
app.use(
  '/scheduleboard/assets',
  express.static(path.join(clientDir, 'assets'), { maxAge: '30d', immutable: true })
);

// ルートの末尾スラを強制（/scheduleboard → /scheduleboard/）
app.get('/scheduleboard', (_req, res) => res.redirect(301, '/scheduleboard/'));

// index.html は no-cache（常に最新）
app.get('/scheduleboard/*', (_req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(clientDir, 'index.html'));
});

/* ===== 未処理エラーの最終ハンドラ ===== */
app.use((err, _req, res, _next) => {
  console.error('[Unhandled]', err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

/* ===== 起動 ===== */
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server http://localhost:${PORT}`);
  console.log(`WebSocket: /socket.io (Nginx経由で /api/scheduleboard/socket.io/ からアクセス可能)`);
});
