const express = require('express');
const router = express.Router();

// GET /api/employees
router.get('/', (req, res) => {
  res.json({
    ok: true,
    employees: [
      { id: 1, code: '001', name: '田中太郎', department: 1 },
      { id: 2, code: '002', name: '佐藤花子', department: 2 },
    ],
  });
});

module.exports = router;
