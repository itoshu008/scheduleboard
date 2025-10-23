const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./scheduleboard.db');

console.log('=== schedulesテーブルの最新10件 ===');
db.all('SELECT * FROM schedules ORDER BY id DESC LIMIT 10', (err, rows) => {
  if (err) {
    console.error('schedulesテーブルエラー:', err);
  } else {
    console.log('schedules件数:', rows.length);
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ID: ${row.id}`);
      console.log('   タイトル:', row.title);
      console.log('   開始:', row.start_datetime);
      console.log('   終了:', row.end_datetime);
      console.log('   社員ID:', row.employee_id);
      console.log('   作成日:', row.created_at);
      console.log('---');
    });
  }
  
  console.log('\n=== 今日のschedules ===');
  db.all('SELECT * FROM schedules WHERE start_datetime LIKE "2025-09-24%" ORDER BY id DESC', (err2, todayRows) => {
    if (err2) {
      console.error('今日のschedules検索エラー:', err2);
    } else {
      console.log('今日のschedules:', todayRows.length);
      todayRows.forEach(row => {
        console.log('ID:', row.id, 'Title:', row.title, 'Start:', row.start_datetime);
      });
    }
    
    console.log('\n=== 全テーブルの今日のデータ ===');
    db.get('SELECT COUNT(*) as count FROM equipment_reservations WHERE start_datetime LIKE "2025-09-24%"', (err3, equipCount) => {
      console.log('equipment_reservations (今日):', equipCount ? equipCount.count : 0);
      
      db.get('SELECT COUNT(*) as count FROM schedules WHERE start_datetime LIKE "2025-09-24%"', (err4, schedCount) => {
        console.log('schedules (今日):', schedCount ? schedCount.count : 0);
        db.close();
      });
    });
  });
});
