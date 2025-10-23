const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, 'scheduleboard.db');
const db = new sqlite3.Database(dbPath);

// 設備予約更新の新しいエンドポイント
app.put('/api/equipment-reservations/:id', (req, res) => {
  const id = parseInt(req.params.id);
  console.log('[UPDATE] id:', id, 'body:', req.body);
  
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  const { title, purpose, equipment_id, employee_id, start_datetime, end_datetime, color } = req.body;
  
  // 更新するフィールドを構築
  const updates = [];
  const values = [];
  
  if (title !== undefined) {
    updates.push('title = ?');
    values.push(title);
  }
  if (purpose !== undefined) {
    updates.push('purpose = ?');
    values.push(purpose);
  }
  if (equipment_id !== undefined) {
    updates.push('equipment_id = ?');
    values.push(equipment_id);
  }
  if (employee_id !== undefined) {
    updates.push('employee_id = ?');
    values.push(employee_id);
  }
  if (start_datetime !== undefined) {
    updates.push('start_datetime = ?');
    values.push(new Date(start_datetime));
  }
  if (end_datetime !== undefined) {
    updates.push('end_datetime = ?');
    values.push(new Date(end_datetime));
  }
  if (color !== undefined) {
    updates.push('color = ?');
    values.push(color);
  }
  
  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  
  values.push(id);
  
  const sql = `UPDATE equipment_reservations SET ${updates.join(', ')} WHERE id = ?`;
  
  db.run(sql, values, function(err) {
    if (err) {
      console.error('Update error:', err);
      return res.status(500).json({ error: 'Database error', message: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Reservation not found' });
    }
    
    // 更新されたレコードを取得
    db.get('SELECT * FROM equipment_reservations WHERE id = ?', [id], (err, row) => {
      if (err) {
        console.error('Select error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      
      res.json(row);
    });
  });
});

// 既存の予約を取得するエンドポイント
app.get('/api/equipment-reservations', (req, res) => {
  const sql = 'SELECT * FROM equipment_reservations ORDER BY start_datetime';
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Select error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});

const PORT = 4002;
app.listen(PORT, () => {
  console.log(`Update server running on port ${PORT}`);
});
