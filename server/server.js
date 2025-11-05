/* eslint-disable */
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const { bootstrap, getPool } = require('./db');

const app = express();
app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());

// Boot DB then start server
let ready = false;
bootstrap().then(() => { ready = true; }).catch(err => {
  console.error('[DB bootstrap error]', err);
});

// ===== API routes =====
app.get('/api/health', async (_req, res) => {
  try {
    if (!ready) return res.json({ ok: true, service: 'scheduleboard', db: 'initializing' });
    const [rows] = await getPool().query('SELECT DATABASE() db, NOW() as now;');
    res.json({ ok: true, service: 'scheduleboard', db: rows[0].db, time: rows[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Helpers
const asyncH = (fn) => (req, res) => fn(req, res).catch(e => {
  console.error(e);
  res.status(500).json({ ok: false, error: String(e) });
});

// Routes (minimal)
app.get('/api/groups', asyncH(async (_req, res) => {
  const [rows] = await getPool().query('SELECT * FROM groups ORDER BY id;');
  res.json({ ok: true, groups: rows });
}));

app.post('/api/groups', asyncH(async (req, res) => {
  const { name, color } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  const [r] = await getPool().query('INSERT INTO groups(name, color) VALUES (?, ?);', [name, color || null]);
  res.json({ ok: true, id: r.insertId });
}));

app.get('/api/users', asyncH(async (_req, res) => {
  const [rows] = await getPool().query(
    'SELECT u.*, g.name AS group_name FROM users u LEFT JOIN groups g ON g.id=u.group_id ORDER BY u.id;'
  );
  res.json({ ok: true, users: rows });
}));

app.post('/api/users', asyncH(async (req, res) => {
  const { code, name, email, group_id } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'name required' });
  const [r] = await getPool().query(
    'INSERT INTO users(code, name, email, group_id) VALUES (?, ?, ?, ?);',
    [code || null, name, email || null, group_id || null]
  );
  res.json({ ok: true, id: r.insertId });
}));

app.get('/api/templates', asyncH(async (_req, res) => {
  const [rows] = await getPool().query('SELECT * FROM templates ORDER BY id;');
  res.json({ ok: true, templates: rows });
}));

app.post('/api/templates', asyncH(async (req, res) => {
  const { title, description, color } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'title required' });
  const [r] = await getPool().query(
    'INSERT INTO templates(title, description, color) VALUES (?, ?, ?);',
    [title, description || null, color || null]
  );
  res.json({ ok: true, id: r.insertId });
}));

app.get('/api/events', asyncH(async (req, res) => {
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

app.post('/api/events', asyncH(async (req, res) => {
  const { user_id, template_id, start_at, end_at, note } = req.body || {};
  if (!user_id || !start_at || !end_at) return res.status(400).json({ ok: false, error: 'user_id, start_at, end_at required' });
  const [r] = await getPool().query(
    'INSERT INTO events(user_id, template_id, start_at, end_at, note) VALUES (?, ?, ?, ?, ?);',
    [user_id, template_id || null, start_at, end_at, note || null]
  );
  res.json({ ok: true, id: r.insertId });
}));

// API 404 guard
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

// ===== Static client (production) under /shuke-b =====
const clientDir = path.join(__dirname, '..', 'suke', 'dist');
// Cache assets aggressively
app.use('/shuke-b/assets', express.static(path.join(clientDir, 'assets'), { maxAge: '30d', immutable: true }));
// index.html must not be cached
app.get('/shuke-b', (_req, res) => res.redirect(301, '/shuke-b/'));
app.get('/shuke-b/*', (_req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(clientDir, 'index.html'));
});

// Global error handler (last)
app.use((err, _req, res, _next) => {
  console.error('[Unhandled]', err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server http://localhost:${PORT}`));
