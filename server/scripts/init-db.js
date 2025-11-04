// scripts/init-db.js
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const {
    MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
  } = process.env;

  const rootConn = await mysql.createConnection({
    host: MYSQL_HOST || '127.0.0.1',
    port: Number(MYSQL_PORT || 3306),
    user: 'root',
    password: process.env.ROOT_PASSWORD || '' // 既にrootで入れないなら飛ばす
  }).catch(() => null);

  // 開発ユーザー＆DB作成（rootで入れない場合はスキップ可）
  if (rootConn) {
    try {
      await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` DEFAULT CHARACTER SET utf8mb4`);
      await rootConn.query(`CREATE USER IF NOT EXISTS 'sched'@'127.0.0.1' IDENTIFIED BY 'localpass'`);
      await rootConn.query(`GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO 'sched'@'127.0.0.1'`);
      await rootConn.query(`FLUSH PRIVILEGES`);
      console.log('DB/user prepared.');
    } catch (e) {
      console.warn('DB/user prepare skipped:', e.message);
    } finally {
      await rootConn.end();
    }
  } else {
    console.warn('root接続スキップ（既存MySQLにユーザー/DBがある想定）。');
  }

  // アプリユーザーで接続
  const conn = await mysql.createConnection({
    host: MYSQL_HOST || '127.0.0.1',
    port: Number(MYSQL_PORT || 3306),
    user: MYSQL_USER || 'sched',
    password: MYSQL_PASSWORD || 'localpass',
    database: MYSQL_DATABASE || 'scheduleboard',
    multipleStatements: true
  });

  const sql = `
CREATE TABLE IF NOT EXISTS departments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS employees (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  department INT,
  FOREIGN KEY (department) REFERENCES departments(id)
);

CREATE TABLE IF NOT EXISTS equipment (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  employee_id INT,
  title VARCHAR(200),
  start DATETIME,
  end DATETIME,
  all_day TINYINT DEFAULT 0,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

INSERT INTO departments (name) VALUES ('営業'),('人事'),('開発')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO employees (code, name, department) VALUES
('001','田中太郎',1),
('002','佐藤花子',2)
ON DUPLICATE KEY UPDATE name=VALUES(name), department=VALUES(department);

INSERT INTO equipment (name) VALUES ('カメラA'),('ライトB')
ON DUPLICATE KEY UPDATE name=VALUES(name);
  `;

  await conn.query(sql);
  await conn.end();
  console.log('✨ DB initialized & seeded.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
