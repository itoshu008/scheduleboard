const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

app.get('/health', (req, res) => res.status(200).json({ ok: true }));
app.get('/ping',   (req, res) => res.send('pong'));

// 1行アクセスログ
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now()-t}ms`));
  next();
});

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// 静的配信（server/index.js から見て ../suke/dist）
const STATIC_ROOT = fs.existsSync(path.join(__dirname, '..', 'suke', 'dist', 'index.html'))
  ? path.join(__dirname, '..', 'suke', 'dist')
  : path.join(__dirname, 'suke', 'dist');
app.use(express.static(STATIC_ROOT));

// ヘルス
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ====== ここから「モード切替」 ======
const useMock = process.env.MOCK_API === '1';

if (useMock) {
  console.warn('⚠ MOCK_API=1 → モックAPIを提供します（DBアクセスは行いません）');

  const departments = [{ id: 1, name: '撮影部' }, { id: 2, name: '編集部' }];
  const employees   = [
    { id: 1, name: '田中', departmentId: 1, color: '#3498db' },
    { id: 2, name: '佐藤', departmentId: 2, color: '#e74c3c' },
  ];
  const equipment   = [{ id: 1, name: 'Aスタジオ' }, { id: 2, name: 'ライティングB' }];
  const schedules   = []; // 必要ならダミーを追加可能

  app.get('/api/departments', (_req, res) => res.json(departments));
  app.get('/api/employees',   (_req, res) => res.json(employees));
  app.get('/api/equipment',   (_req, res) => res.json(equipment));
  app.get('/api/schedules',   (_req, res) => res.json(schedules));
  app.get('/api/schedules/daily-all', (_req, res) => res.json([]));
  app.get('/api/equipment-reservations', (_req, res) => res.json([]));

} else {
  // 本番API（DBに到達する必要あり）— DBが通らないと 500 になります
  try {
    app.use('/api/departments',            require('./dist/routes/departments'));
    app.use('/api/employees',              require('./dist/routes/employees'));
    app.use('/api/schedules',              require('./dist/routes/schedules'));
    app.use('/api/equipment',              require('./dist/routes/equipment'));
    app.use('/api/equipment-reservations', require('./dist/routes/equipmentReservations'));
  } catch (e) {
    console.warn('dist ルートの読み込みに失敗。APIが一部無効です:', e?.message || e);
  }
}
// ====== 切替ここまで ======

// SPA ルーティング
app.get('*', (_req, res) => res.sendFile(path.join(STATIC_ROOT, 'index.html')));

// 404
app.use((req, res) => {
  res.status(404).json({ ok:false, error:'Not Found', path:req.url });
});

// エラーハンドラ
app.use((err, req, res, next) => {
  console.error('[ERROR]', err && (err.stack || err));
  res.status(500).json({ ok:false, error: String(err && err.message || err) });
});

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});