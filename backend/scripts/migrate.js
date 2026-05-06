import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!env.database) {
  console.error('Configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_DATABASE');
  process.exit(1);
}

const migrationsDir = path.join(__dirname, '..', '..', 'database', 'migrations');
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const connection = await mysql.createConnection({ ...env.database, multipleStatements: false });
try {
  for (const file of files) {
    const sqlPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = sql
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      try {
        await connection.query(statement);
      } catch (e) {
        if (e?.code === 'ER_DUP_FIELDNAME') {
          continue;
        }
        throw e;
      }
    }
    console.log('Migração aplicada:', file);
  }
} finally {
  await connection.end();
}
