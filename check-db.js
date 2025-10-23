const sqlite3 = require('sqlite3');

const db = new sqlite3.Database('./scheduleboard.db');

console.log('=== データベース接続確認 ===');

// 最新のスケジュール10件を取得
db.all('SELECT id, employee_id, title, start_datetime, end_datetime, created_at FROM schedules ORDER BY created_at DESC LIMIT 10', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`\n最新の${rows.length}件のスケジュール:`);
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ID:${row.id} | 社員ID:${row.employee_id} | タイトル:${row.title}`);
      console.log(`   開始:${row.start_datetime} | 終了:${row.end_datetime}`);
      console.log(`   作成日時:${row.created_at}\n`);
    });
  }
  
  // 今日のスケジュール確認
  db.all(`SELECT id, employee_id, title, start_datetime, end_datetime, created_at 
          FROM schedules 
          WHERE date(start_datetime) = '2025-09-20' 
          ORDER BY start_datetime`, (err, todayRows) => {
    if (err) {
      console.error('Today schedules error:', err);
    } else {
      console.log(`\n今日(2025-09-20)のスケジュール: ${todayRows.length}件`);
      todayRows.forEach((row, index) => {
        console.log(`${index + 1}. ID:${row.id} | 社員ID:${row.employee_id} | ${row.title}`);
        console.log(`   時間:${row.start_datetime} - ${row.end_datetime}`);
      });
    }
    
    db.close();
  });
});
