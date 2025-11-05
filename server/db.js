/* eslint-disable */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_NAME = 'scheduleboard',
  DB_USER = 'sb_user',
  DB_PASSWORD = 'sb_pass'
} = process.env;

let pool;

/**
 * Ensure DB and tables exist.
 *  - Create DB if not exists.
 *  - Create core tables if not exists.
 */
async function bootstrap() {
  // Connect to server without database to create it if needed
  const rootPool = await mysql.createPool({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASSWORD,
    waitForConnections: true, connectionLimit: 10, queueLimit: 0
  });

  await rootPool.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` /*!40100 DEFAULT CHARACTER SET utf8mb4 */;`);
  await rootPool.end();

  pool = await mysql.createPool({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASSWORD, database: DB_NAME,
    waitForConnections: true, connectionLimit: 10, queueLimit: 0
  });

  const ddl = `
CREATE TABLE IF NOT EXISTS groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(32) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NULL,
  group_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_group
    FOREIGN KEY (group_id) REFERENCES groups(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description TEXT NULL,
  color VARCHAR(32) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  template_id INT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_events_template
    FOREIGN KEY (template_id) REFERENCES templates(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_events_user_time (user_id, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

  // Run multiple statements safely
  for (const stmt of ddl.split(';').map(s => s.trim()).filter(Boolean)) {
    await pool.query(stmt);
  }

  // Seed minimal data if empty
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM groups;');
  if (rows[0].c === 0) {
    await pool.query('INSERT INTO groups(name, color) VALUES (?, ?), (?, ?);',
      ['Default', '#4f46e5', 'Support', '#16a34a']);
  }
  return pool;
}

function getPool() {
  if (!pool) throw new Error('DB pool not initialized. Call bootstrap() first.');
  return pool;
}

module.exports = { bootstrap, getPool };

