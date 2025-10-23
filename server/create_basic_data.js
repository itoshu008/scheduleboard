const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./scheduleboard.db');

console.log('=== 基本データを作成 ===');

// 部署データの作成
const departments = [
  { name: '営業部', display_order: 1 },
  { name: '開発部', display_order: 2 },
  { name: '総務部', display_order: 3 }
];

// 社員データの作成
const employees = [
  { employee_number: 'EMP001', name: '田中太郎', department_id: 1, display_order: 1 },
  { employee_number: 'EMP002', name: '佐藤花子', department_id: 1, display_order: 2 },
  { employee_number: 'EMP003', name: '鈴木一郎', department_id: 2, display_order: 1 },
  { employee_number: 'EMP004', name: '高橋美咲', department_id: 2, display_order: 2 },
  { employee_number: 'EMP005', name: '山田次郎', department_id: 3, display_order: 1 }
];

// 設備データの作成
const equipment = [
  { name: '会議室A', description: '10人用会議室', display_order: 1 },
  { name: '会議室B', description: '6人用会議室', display_order: 2 },
  { name: 'プロジェクター1', description: '大型プロジェクター', display_order: 3 },
  { name: 'ノートPC', description: '会議用ノートPC', display_order: 4 },
  { name: 'テレビ', description: '大型テレビ', display_order: 5 }
];

// 部署データを挿入
console.log('部署データを作成中...');
departments.forEach((dept, index) => {
  db.run(
    'INSERT OR IGNORE INTO departments (name, display_order) VALUES (?, ?)',
    [dept.name, dept.display_order],
    function(err) {
      if (err) {
        console.error('部署データ作成エラー:', err);
      } else {
        console.log(`✅ 部署${index + 1}作成完了: ${dept.name}`);
      }
    }
  );
});

// 社員データを挿入
console.log('社員データを作成中...');
employees.forEach((emp, index) => {
  db.run(
    'INSERT OR IGNORE INTO employees (employee_number, name, department_id, display_order) VALUES (?, ?, ?, ?)',
    [emp.employee_number, emp.name, emp.department_id, emp.display_order],
    function(err) {
      if (err) {
        console.error('社員データ作成エラー:', err);
      } else {
        console.log(`✅ 社員${index + 1}作成完了: ${emp.name} (${emp.employee_number})`);
      }
    }
  );
});

// 設備データを挿入
console.log('設備データを作成中...');
equipment.forEach((eq, index) => {
  db.run(
    'INSERT OR IGNORE INTO equipment (name, display_order) VALUES (?, ?)',
    [eq.name, eq.display_order],
    function(err) {
      if (err) {
        console.error('設備データ作成エラー:', err);
      } else {
        console.log(`✅ 設備${index + 1}作成完了: ${eq.name}`);
      }
    }
  );
});

// データ作成完了を待つ
setTimeout(() => {
  console.log('\n=== データ作成完了 ===');
  
  // 作成されたデータを確認
  db.all('SELECT * FROM departments', (err, rows) => {
    if (err) {
      console.error('部署データ取得エラー:', err);
    } else {
      console.log(`部署データ: ${rows.length}件`);
      rows.forEach(row => console.log(`- ${row.name}`));
    }
  });
  
  db.all('SELECT * FROM employees', (err, rows) => {
    if (err) {
      console.error('社員データ取得エラー:', err);
    } else {
      console.log(`社員データ: ${rows.length}件`);
      rows.forEach(row => console.log(`- ${row.name} (${row.employee_number})`));
    }
  });
  
  db.all('SELECT * FROM equipment', (err, rows) => {
    if (err) {
      console.error('設備データ取得エラー:', err);
    } else {
      console.log(`設備データ: ${rows.length}件`);
      rows.forEach(row => console.log(`- ${row.name}`));
    }
  });
  
  db.close();
}, 2000);
