const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 4001; // ↁE変更禁止�E�Eginx設定に合わせる�E�E
// ミドルウェア
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// リクエスト�E処琁E��間を計測してログ出劁Eapp.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationMs = diff[0] * 1e3 + diff[1] / 1e6;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs.toFixed(1)} ms`);
  });
  next();
});

// 静的ファイル�E�フロント）を提侁Eapp.use(express.static(path.join(__dirname, 'suke')));

// ヘルスチェチE��
app.get('/api/health', (req, res) => {
  res.json({ message: 'OK' });
});

// templates ルート�E下記�Eルーター経由で処琁E
// API ルート（ビルド済みの dist から読み込み�E�。dist が無ぁE��合�E警告�Eみ
try {
  app.use('/api/departments', require('./routes/departments'));
  app.use('/api/employees', require('./routes/employees'));
  app.use('/api/schedules', require('./routes/schedules'));
  app.use('/api/equipment', require('./routes/equipment'));
  app.use('/api/equipment-reservations', require('./routes/equipmentReservations'));
} catch (e) {
  console.warn('dist ルート�E読み込みに失敗しました、EPI は無効です、E, e && e.message ? e.message : e);
}

// templates ルートを追加�E�既存�Eスタブを統合！Etry {
  app.use('/api/templates', require('./routes/templates'));
} catch (e) {
  console.warn('templates ルート�E読み込みに失敗しました、E, e && e.message ? e.message : e);
}

// 404ハンドラー�E�存在しなぁE/api/* に対して�E�Eapp.all('/api/*', (req, res) => {
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

// SPA ルーチE��ング�E�最後に配置�E�Eapp.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'suke', 'index.html'));
});

// サーバ�E起動！EB への破壊的操作�E一刁E��わなぁE��Eapp.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});



