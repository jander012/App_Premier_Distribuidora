import pg from 'pg';
import { env } from './env.js';

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL é obrigatório');
}

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

export async function query(text, params) {
  return pool.query(text, params);
}
