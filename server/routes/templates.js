const express = require('express');
const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const pool = req.app.locals.pool;
    const [rows] = await pool.query(
      'SELECT id, name, title, color, duration_minutes FROM schedule_templates ORDER BY id DESC'
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, title, color = '#81ECEC', duration_minutes = 60 } = req.body || {};
    const pool = req.app.locals.pool;
    const [r] = await pool.execute(
      'INSERT INTO schedule_templates (name, title, color, duration_minutes) VALUES (?, ?, ?, ?)',
      [name, title, color, duration_minutes]
    );
    res.status(201).json({ id: r.insertId, name, title, color, duration_minutes });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { name, title, color, duration_minutes } = req.body || {};
    const pool = req.app.locals.pool;
    await pool.execute(
      'UPDATE schedule_templates SET name = COALESCE(?, name), title = COALESCE(?, title), color = COALESCE(?, color), duration_minutes = COALESCE(?, duration_minutes) WHERE id = ?',
      [name, title, color, duration_minutes, id]
    );
    res.json({ id, name, title, color, duration_minutes });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pool = req.app.locals.pool;
    await pool.execute('DELETE FROM schedule_templates WHERE id = ?', [id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
