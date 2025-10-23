const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'scheduleboard.db');
console.log('データベースパス:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('データベース接続エラー:', err);
  } else {
    console.log('✅ データベース接続成功');
  }
});

// テーブル一覧を取得
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('テーブル一覧取得エラー:', err);
  } else {
    console.log('\n=== テーブル一覧 ===');
    tables.forEach(table => {
      console.log(`- ${table.name}`);
    });
  }
});

// 設備テーブルのデータを確認
db.all('SELECT * FROM equipment LIMIT 5', (err, rows) => {
  if (err) {
    console.error('設備データ取得エラー:', err);
  } else {
    console.log('\n=== 設備データ（最初の5件） ===');
    console.log(`件数: ${rows.length}`);
    rows.forEach((row, index) => {
      console.log(`${index + 1}. ID:${row.id} - ${row.name}`);
    });
  }
  
  db.close();
});
