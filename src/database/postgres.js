import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
const fallbackConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'wbot'
};

export const pool = new Pool(
  connectionString
    ? {
        connectionString
      }
    : fallbackConfig
);

pool.on('error', (err) => {
  console.error('[postgres] Pool error:', err);
});

export async function query(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('[postgres] Query error:', err);
    throw err;
  }
}