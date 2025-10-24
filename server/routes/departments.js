const express = require('express');
const router = express.Router();

// GET /api/departments
router.get('/', (req, res) => {
  res.json({
    ok: true,
    departments: [
      { id: 1, name: '営業' },
      { id: 2, name: '人事' },
      { id: 3, name: '開発' },
    ],
  });
});

module.exports = router;
