const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 4001; // 竊・螟画峩遖∵ｭ｢・・ginx險ｭ螳壹↓蜷医ｏ縺帙ｋ・・
// 繝溘ラ繝ｫ繧ｦ繧ｧ繧｢
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// 繝ｪ繧ｯ繧ｨ繧ｹ繝医・蜃ｦ逅・凾髢薙ｒ險域ｸｬ縺励※繝ｭ繧ｰ蜃ｺ蜉・app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationMs = diff[0] * 1e3 + diff[1] / 1e6;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs.toFixed(1)} ms`);
  });
  next();
});

// 髱咏噪繝輔ぃ繧､繝ｫ・医ヵ繝ｭ繝ｳ繝茨ｼ峨ｒ謠蝉ｾ・app.use(express.static(path.join(__dirname, 'suke')));

// 繝倥Ν繧ｹ繝√ぉ繝・け
app.get('/api/health', (req, res) => {
  res.json({ message: 'OK' });
});

// templates 繝ｫ繝ｼ繝医・荳玖ｨ倥・繝ｫ繝ｼ繧ｿ繝ｼ邨檎罰縺ｧ蜃ｦ逅・
// API 繝ｫ繝ｼ繝茨ｼ医ン繝ｫ繝画ｸ医∩縺ｮ dist 縺九ｉ隱ｭ縺ｿ霎ｼ縺ｿ・峨Ｅist 縺檎┌縺・ｴ蜷医・隴ｦ蜻翫・縺ｿ
try {
  app.use('/api/departments', require('./routes/departments'));
  app.use('/api/employees', require('./routes/employees'));
  app.use('/api/schedules', require('./routes/schedules'));
  app.use('/api/equipment', require('./routes/equipment'));
  app.use('/api/equipment-reservations', require('./routes/equipmentReservations'));
} catch (e) {
  console.warn('dist 繝ｫ繝ｼ繝医・隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・PI 縺ｯ辟｡蜉ｹ縺ｧ縺吶・, e && e.message ? e.message : e);
}

// templates 繝ｫ繝ｼ繝医ｒ霑ｽ蜉・域里蟄倥・繧ｹ繧ｿ繝悶ｒ邨ｱ蜷茨ｼ・try {
  app.use('/api/templates', require('./routes/templates'));
} catch (e) {
  console.warn('templates 繝ｫ繝ｼ繝医・隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・, e && e.message ? e.message : e);
}

// 404繝上Φ繝峨Λ繝ｼ・亥ｭ伜惠縺励↑縺・/api/* 縺ｫ蟇ｾ縺励※・・app.all('/api/*', (req, res) => {
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

// SPA 繝ｫ繝ｼ繝・ぅ繝ｳ繧ｰ・域怙蠕後↓驟咲ｽｮ・・app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'suke', 'index.html'));
});

// 繧ｵ繝ｼ繝舌・襍ｷ蜍包ｼ・B 縺ｸ縺ｮ遐ｴ螢顔噪謫堺ｽ懊・荳蛻・｡後ｏ縺ｪ縺・ｼ・app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});



