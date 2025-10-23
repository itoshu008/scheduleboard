const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./scheduleboard.db');

console.log('=== 最新10件の予約（全期間・詳細） ===');
db.all('SELECT * FROM equipment_reservations ORDER BY id DESC LIMIT 10', (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('最新予約件数:', rows.length);
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ID: ${row.id}`);
      console.log('   目的/タイトル:', row.purpose || row.title || 'なし');
      console.log('   設備ID:', row.equipment_id);
      console.log('   社員ID:', row.employee_id);
      console.log('   開始:', row.start_datetime);
      console.log('   終了:', row.end_datetime);
      console.log('   色:', row.color);
      console.log('   作成日:', row.created_at);
      console.log('   更新日:', row.updated_at);
      console.log('---');
    });
    
    console.log('\n=== 今日(2025-09-24)の予約 ===');
    db.all('SELECT * FROM equipment_reservations WHERE start_datetime LIKE "2025-09-24%" OR end_datetime LIKE "2025-09-24%" ORDER BY id DESC', (err2, todayRows) => {
      console.log('今日の予約件数:', todayRows.length);
      todayRows.forEach((row, index) => {
        console.log(`${index + 1}. ID: ${row.id} - ${row.purpose} (${row.start_datetime} - ${row.end_datetime})`);
      });
      
      console.log('\n=== 今日以降の予約を検索 ===');
      db.all('SELECT * FROM equipment_reservations WHERE start_datetime >= "2025-09-24" ORDER BY id DESC', (err3, futureRows) => {
        console.log('今日以降の予約:', futureRows.length);
        futureRows.forEach(row => {
          console.log('ID:', row.id, 'Purpose:', row.purpose, 'Start:', row.start_datetime);
        });
        db.close();
      });
    });
  }
});
