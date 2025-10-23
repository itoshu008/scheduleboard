const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./scheduleboard.db');

console.log('=== 今日のテストデータを作成 ===');

// 今日の日付で簡単なテストデータを作成
const today = '2025-09-24';

const testData = [
  {
    purpose: 'テスト会議1',
    equipment_id: 1,
    employee_id: 1,
    start_datetime: `${today}T09:00:00`,
    end_datetime: `${today}T10:00:00`,
    color: '#dc3545'
  },
  {
    purpose: 'テスト会議2', 
    equipment_id: 2,
    employee_id: 2,
    start_datetime: `${today}T11:00:00`,
    end_datetime: `${today}T12:00:00`,
    color: '#28a745'
  },
  {
    purpose: 'テスト会議3',
    equipment_id: 3,
    employee_id: 3,
    start_datetime: `${today}T14:00:00`,
    end_datetime: `${today}T15:30:00`,
    color: '#007bff'
  }
];

// データを挿入
let completed = 0;
testData.forEach((data, index) => {
  db.run(
    'INSERT INTO equipment_reservations (purpose, equipment_id, employee_id, start_datetime, end_datetime, color) VALUES (?, ?, ?, ?, ?, ?)',
    [data.purpose, data.equipment_id, data.employee_id, data.start_datetime, data.end_datetime, data.color],
    function(err) {
      if (err) {
        console.error(`データ${index + 1}の作成エラー:`, err);
      } else {
        console.log(`✅ データ${index + 1}作成完了: ID ${this.lastID} - ${data.purpose}`);
      }
      
      completed++;
      if (completed === testData.length) {
        // 作成後に確認
        db.all(
          `SELECT * FROM equipment_reservations WHERE start_datetime LIKE '${today}%' ORDER BY start_datetime`,
          (err, rows) => {
            if (err) {
              console.error('確認エラー:', err);
            } else {
              console.log(`\n=== ${today}の予約確認 ===`);
              console.log(`件数: ${rows.length}`);
              rows.forEach(row => {
                console.log(`- ID:${row.id} ${row.purpose} (設備${row.equipment_id}) ${row.start_datetime.slice(11,16)}-${row.end_datetime.slice(11,16)}`);
              });
            }
            db.close();
          }
        );
      }
    }
  );
});
