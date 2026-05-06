import mysql from 'mysql2/promise';
import { env } from './env.js';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL é obrigatório');
}

function normalizeParams(params = []) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (value instanceof Date) return value;
    return Array.isArray(value) || (value && typeof value === 'object') ? JSON.stringify(value) : value;
  });
}

function prepareStatement(text, params = []) {
  const nextParams = [];
  const sql = String(text).replace(/\$(\d+)/g, (_, index) => {
    nextParams.push(params[Number(index) - 1]);
    return '?';
  });
  return { sql, params: normalizeParams(nextParams) };
}

function isConnectionCommand(text) {
  return /^(BEGIN|START\s+TRANSACTION|COMMIT|ROLLBACK)$/i.test(String(text).trim());
}

const jsonFieldNames = new Set([
  'option_ids',
  'options_snapshot',
  'payment_meta',
  'meta',
  'payload',
  'geojson',
  'delivery_area_polygon',
  'default_address',
  'stores',
]);

function parseJsonFields(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    for (const key of jsonFieldNames) {
      if (typeof row[key] === 'string' && row[key]) {
        try {
          row[key] = JSON.parse(row[key]);
        } catch {
          // Keep the raw database value if it is not valid JSON.
        }
      }
    }
    return row;
  });
}

function normalizeResult(result) {
  if (Array.isArray(result)) {
    const [rawRows] = result;
    const rows = parseJsonFields(rawRows);
    return {
      rows: Array.isArray(rows) ? rows : [],
      rowCount: rows?.affectedRows ?? (Array.isArray(rows) ? rows.length : 0),
      insertId: rows?.insertId,
      affectedRows: rows?.affectedRows,
    };
  }
  return result;
}

const mysqlPool = mysql.createPool({
  uri: env.databaseUrl,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  namedPlaceholders: false,
  multipleStatements: false,
});

export const pool = {
  async query(text, params) {
    return query(text, params);
  },
  async connect() {
    const connection = await mysqlPool.getConnection();
    return {
      async query(text, params) {
        if (isConnectionCommand(text)) {
          return normalizeResult(await connection.query(String(text).trim()));
        }
        const statement = prepareStatement(text, params);
        return normalizeResult(await connection.execute(statement.sql, statement.params));
      },
      release() {
        connection.release();
      },
    };
  },
  async end() {
    await mysqlPool.end();
  },
};

export async function query(text, params) {
  const statement = prepareStatement(text, params);
  return normalizeResult(await mysqlPool.execute(statement.sql, statement.params));
}
