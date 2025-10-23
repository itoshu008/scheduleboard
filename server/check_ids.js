const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./scheduleboard.db');

console.log('=== 設備一覧 ===');
db.all('SELECT id, name FROM equipment ORDER BY id', (err, rows) => {
  if (err) {
    console.error('設備取得エラー:', err);
  } else {
    console.log('設備件数:', rows.length);
    rows.forEach(r => console.log(`ID:${r.id} - ${r.name}`));
  }
  
  console.log('\n=== 社員一覧 ===');
  db.all('SELECT id, name FROM employees ORDER BY id', (err2, rows2) => {
    if (err2) {
      console.error('社員取得エラー:', err2);
    } else {
      console.log('社員件数:', rows2.length);
      rows2.forEach(r => console.log(`ID:${r.id} - ${r.name}`));
    }
    db.close();
  });
});
