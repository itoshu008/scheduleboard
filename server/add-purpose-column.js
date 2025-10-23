const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'scheduleboard.db');
const db = new sqlite3.Database(dbPath);

console.log('Adding purpose column to equipment_reservations table...');

db.run('ALTER TABLE equipment_reservations ADD COLUMN purpose TEXT;', (err) => {
  if (err) {
    if (err.message.includes('duplicate column name')) {
      console.log('✅ purpose column already exists');
    } else {
      console.error('❌ Error adding purpose column:', err.message);
    }
  } else {
    console.log('✅ purpose column added successfully');
  }
  
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
  });
});
