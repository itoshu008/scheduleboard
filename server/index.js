const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 4001; // ← 変更禁止（Nginx設定に合わせる）

// ミドルウェア
app.use(cors({ origin: true, credentials: true }));
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

// templates ルートは下記のルーター経由で処理

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

// templates ルートを追加（既存のスタブを統合）
try {
  app.use('/api/templates', require('./routes/templates'));
} catch (e) {
  console.warn('templates ルートの読み込みに失敗しました。', e && e.message ? e.message : e);
}

// 404ハンドラー（存在しない /api/* に対して）
app.all('/api/*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.originalUrl,
    hint: [
      'GET /api/health',
      'GET /api/departments',
      'GET /api/employees',
      'GET /api/equipment',
      'GET /api/schedules',
      'GET /api/schedules/daily-all?date=YYYY-MM-DD',
      'GET /api/schedules/daily/all/:date',
      'GET /api/templates'
    ]
  });
});

// SPA ルーティング（最後に配置）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'suke', 'index.html'));
});

// サーバー起動（DB への破壊的操作は一切行わない）
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});



