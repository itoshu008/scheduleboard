const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./scheduleboard.db');

console.log('=== 今日(2025-09-24)の設備予約を確認 ===');

db.all(`
  SELECT id, equipment_id, purpose, start_datetime, end_datetime 
  FROM equipment_reservations 
  WHERE start_datetime LIKE '2025-09-24%' OR end_datetime LIKE '2025-09-24%'
  ORDER BY equipment_id, start_datetime
`, (err, rows) => {
  if (err) {
    console.error('エラー:', err);
  } else {
    console.log('件数:', rows.length);
    rows.forEach(row => {
      console.log(`ID:${row.id} 設備:${row.equipment_id} ${row.purpose} ${row.start_datetime} - ${row.end_datetime}`);
    });
    
    // 重複をチェック
    console.log('\n=== 重複チェック ===');
    const conflicts = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const r1 = rows[i];
        const r2 = rows[j];
        
        // 同じ設備で時間が重複しているかチェック
        if (r1.equipment_id === r2.equipment_id) {
          const start1 = new Date(r1.start_datetime);
          const end1 = new Date(r1.end_datetime);
          const start2 = new Date(r2.start_datetime);
          const end2 = new Date(r2.end_datetime);
          
          // 重複チェック: NOT (end1 <= start2 OR start1 >= end2)
          if (!(end1 <= start2 || start1 >= end2)) {
            conflicts.push({ r1, r2 });
            console.log(`⚠️ 重複発見: ID${r1.id}(${r1.start_datetime}-${r1.end_datetime}) と ID${r2.id}(${r2.start_datetime}-${r2.end_datetime})`);
          }
        }
      }
    }
    
    if (conflicts.length === 0) {
      console.log('✅ 重複なし');
    }
  }
  db.close();
});
