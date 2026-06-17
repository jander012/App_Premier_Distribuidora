import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const config = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};

console.log('Testing', { host: config.host, port: config.port, user: config.user, database: config.database });

try {
  const conn = await mysql.createConnection(config);
  const [rows] = await conn.query('SELECT DATABASE() AS db');
  const [stores] = await conn.query('SELECT COUNT(*) AS c FROM stores');
  console.log('OK', rows[0], stores[0]);
  await conn.end();
} catch (e) {
  console.error('FAIL', e.code, e.message);
  process.exit(1);
}
