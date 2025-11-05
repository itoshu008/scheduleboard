require('dotenv').config();
const { bootstrap, getPool } = require('./db');

(async () => {
  await bootstrap();
  const pool = getPool();
  const [rows] = await pool.query('SELECT NOW() AS now;');
  console.log(rows[0]);
  process.exit(0);
})();

