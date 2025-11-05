/* eslint-disable */
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const mysql = require('mysql2/promise');

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_NAME = 'scheduleboard',
  DB_USER = 'sb_user',
  DB_PASSWORD = 'sb_pass'
} = process.env;

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function appliedSet(conn) {
  const [rows] = await conn.query('SELECT filename FROM schema_migrations ORDER BY filename');
  return new Set(rows.map(r => r.filename));
}

function readMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // timestamp prefix order
}

async function runFile(conn, file) {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  // Split by ';' but keep simple; assume files end statements with ';'
  const stmts = sql.split(';').map(s => s.trim()).filter(Boolean);
  const tx = await conn.getConnection();
  try {
    await tx.beginTransaction();
    for (const s of stmts) {
      await tx.query(s);
    }
    await tx.query('INSERT INTO schema_migrations(filename) VALUES(?)', [file]);
    await tx.commit();
    tx.release();
    return true;
  } catch (e) {
    await tx.rollback();
    tx.release();
    throw e;
  }
}

async function main() {
  const mode = process.argv[2] || 'up';
  const pool = await mysql.createPool({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASSWORD, database: DB_NAME,
    waitForConnections: true, connectionLimit: 5
  });
  try {
    await ensureMigrationsTable(pool);
    const files = readMigrations();
    const done = await appliedSet(pool);

    if (mode === 'status') {
      const pending = files.filter(f => !done.has(f));
      console.log('Applied:');
      [...done].forEach(f => console.log('  ✔', f));
      console.log('Pending:');
      pending.forEach(f => console.log('  …', f));
      process.exit(0);
    }

    const pending = files.filter(f => !done.has(f));
    if (pending.length === 0) {
      console.log('No pending migrations.');
      process.exit(0);
    }
    for (const f of pending) {
      console.log('Applying:', f);
      await runFile(pool, f);
      console.log('  ✔ Done:', f);
    }
    console.log('All pending migrations applied.');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();

