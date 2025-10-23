const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./scheduleboard.db');

console.log('=== 設備テーブルの構造確認 ===');

// テーブル構造を確認
db.all("PRAGMA table_info(equipment)", (err, rows) => {
  if (err) {
    console.error('テーブル構造取得エラー:', err);
  } else {
    console.log('設備テーブルの構造:');
    rows.forEach(row => {
      console.log(`- ${row.name}: ${row.type} (${row.notnull ? 'NOT NULL' : 'NULL'})`);
    });
  }
});

console.log('\n=== 設備データの確認 ===');

// 設備データを取得
db.all('SELECT * FROM equipment ORDER BY display_order, id', (err, rows) => {
  if (err) {
    console.error('設備データ取得エラー:', err);
  } else {
    console.log(`設備データ件数: ${rows.length}`);
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ID:${row.id} - ${row.name} (display_order: ${row.display_order})`);
    });
  }
  
  db.close();
});
