const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ミドルウェア
app.use(cors());
app.use(express.json());

// リクエストの処理時間を計測してログ出力
app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationMs = diff[0] * 1e3 + diff[1] / 1e6;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs.toFixed(1)} ms`);
  });
  next();
});

// 静的ファイル（フロント）を提供
app.use(express.static(path.join(__dirname, 'suke')));

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({ message: 'OK' });
});

// templates ルート（スタブ実装）
app.get('/api/templates', (req, res) => {
  console.log('Templates API called - returning empty array');
  res.json([]); // 空配列で UI を生かす
});

// 他のテンプレート操作もスタブで実装
app.post('/api/templates', (req, res) => {
  console.log('Template create called - returning mock data');
  res.status(201).json({ id: 1, name: 'Mock', title: 'Mock Template', color: '#81ECEC', duration_minutes: 60 });
});

app.put('/api/templates/:id', (req, res) => {
  console.log('Template update called - returning mock data');
  res.json({ id: parseInt(req.params.id), ...req.body });
});

app.delete('/api/templates/:id', (req, res) => {
  console.log('Template delete called - returning success');
  res.status(204).end();
});

// API ルート（ビルド済みの dist から読み込み）。dist が無い場合は警告のみ
try {
  app.use('/api/departments', require('./dist/routes/departments'));
  app.use('/api/employees', require('./dist/routes/employees'));
  app.use('/api/schedules', require('./dist/routes/schedules'));
  app.use('/api/equipment', require('./dist/routes/equipment'));
  app.use('/api/equipment-reservations', require('./dist/routes/equipmentReservations'));
} catch (e) {
  console.warn('dist ルートの読み込みに失敗しました。API は無効です。', e && e.message ? e.message : e);
}

// SPA ルーティング（最後に配置）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'suke', 'index.html'));
});

// サーバー起動（DB への破壊的操作は一切行わない）
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});



