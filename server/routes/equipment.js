const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    ok: true,
    equipment: [
      { id: 1, name: "カメラA" },
      { id: 2, name: "ライトB" }
    ]
  });
});

module.exports = router;
