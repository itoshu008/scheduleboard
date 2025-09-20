const mysql = require('mysql2/promise');

async function testConnection() {
  try {
    console.log('データベース接続テストを開始...');
    
    const connection = await mysql.createConnection({
      host: '210.131.208.22',
      port: 3306,
      user: 'itoshu',
      password: 'zatint_6487',
      database: 'zat_sch_db'
    });

    console.log('✅ データベース接続成功');

    // テーブル一覧を取得
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📋 データベース内のテーブル:', tables);

    // 各テーブルの構造を確認
    for (const table of tables) {
      const tableName = Object.values(table)[0];
      console.log(`\n🔍 ${tableName}テーブルの構造:`);
      const [columns] = await connection.execute(`DESCRIBE ${tableName}`);
      console.table(columns);
    }

    // 基本データを確認
    console.log('\n📊 データ確認:');
    
    const [departments] = await connection.execute('SELECT * FROM departments');
    console.log(`部署数: ${departments.length}`);
    
    const [employees] = await connection.execute('SELECT * FROM employees');
    console.log(`社員数: ${employees.length}`);
    
    const [schedules] = await connection.execute('SELECT * FROM schedules');
    console.log(`スケジュール数: ${schedules.length}`);

    await connection.end();
    console.log('✅ テスト完了');
    
  } catch (error) {
    console.error('❌ データベースエラー:', error.message);
    process.exit(1);
  }
}

testConnection();