import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { env } from '../../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (!env.database) {
  console.error('Configure DB_HOST, DB_PORT, DB_USER, DB_PASSWORD e DB_DATABASE');
  process.exit(1);
}

const migrationsDir = path.join(__dirname, '..', 'migrations');
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const transientConnectionErrors = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createReadyConnection() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    let connection;
    try {
      connection = await mysql.createConnection({ ...env.database, multipleStatements: false });
      await connection.query('SELECT 1');
      return connection;
    } catch (e) {
      lastError = e;
      await connection?.end().catch(() => {});
      if (!transientConnectionErrors.has(e?.code)) throw e;
      console.log(`Aguardando MySQL ficar pronto (${attempt}/30)...`);
      await sleep(1000);
    }
  }
  throw lastError;
}

let connection = await createReadyConnection();
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
        if (transientConnectionErrors.has(e?.code)) {
          await connection.end().catch(() => {});
          connection = await createReadyConnection();
          await connection.query(statement);
          continue;
        }
        if (e?.code === 'ER_DUP_FIELDNAME' || e?.code === 'ER_DUP_KEYNAME') {
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
