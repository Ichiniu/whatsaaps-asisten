import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, Client } = pg;

// Ambil konfigurasi DB dari env
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
};
const dbName = process.env.DB_NAME || 'wbot';

let pool = null;

/**
 * Menginisialisasi koneksi PostgreSQL.
 * Membuat database jika belum ada, lalu membuat tabel reminders jika belum ada.
 */
export async function initDatabase() {
  console.log('=== INITIALIZING POSTGRESQL ===');
  
  // 1. Hubungkan ke database default 'postgres' untuk mengecek/membuat database target
  try {
    const client = new Client({
      ...dbConfig,
      database: 'postgres'
    });
    await client.connect();
    
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" tidak ditemukan. Membuat database baru...`);
      // CREATE DATABASE tidak mendukung parameter bindings ($1), harus digabungkan langsung secara aman
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`Database "${dbName}" berhasil dibuat!`);
    } else {
      console.log(`Database "${dbName}" sudah terdaftar.`);
    }
    await client.end();
  } catch (error) {
    console.error('Error memeriksa/membuat database:', error);
    throw error;
  }

  // 2. Hubungkan Pool ke database target
  pool = new Pool({
    ...dbConfig,
    database: dbName
  });

  // 3. Buat tabel reminders jika belum ada
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS reminders (
        id VARCHAR(50) PRIMARY KEY,
        target_jid VARCHAR(100) NOT NULL,
        time TIMESTAMP NOT NULL,
        message TEXT NOT NULL,
        is_sent BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cron VARCHAR(100) DEFAULT NULL,
        last_fired TIMESTAMP DEFAULT NULL
      );
    `;
    await pool.query(createTableQuery);

    // Tambah kolom secara opsional jika tabel sudah ada sebelumnya tanpa kolom ini
    await pool.query(`
      ALTER TABLE reminders ADD COLUMN IF NOT EXISTS cron VARCHAR(100) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE reminders ADD COLUMN IF NOT EXISTS last_fired TIMESTAMP DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE reminders ADD COLUMN IF NOT EXISTS whatsapp_msg_id VARCHAR(100) DEFAULT NULL;
    `);

    console.log('Tabel "reminders" siap digunakan di PostgreSQL.');
  } catch (error) {
    console.error('Error membuat tabel "reminders":', error);
    throw error;
  }

  // 4. Buat tabel conversations untuk memory AI
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        target_jid VARCHAR(100) NOT NULL,
        role VARCHAR(10) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_jid
      ON conversations(target_jid, created_at DESC);
    `);
    console.log('Tabel "conversations" siap digunakan di PostgreSQL.');
  } catch (error) {
    console.error('Error membuat tabel "conversations":', error);
    throw error;
  }

  // 5. Buat tabel user_sessions untuk melacak sesi snooze dan durasi aktif
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        target_jid VARCHAR(100) PRIMARY KEY,
        last_fired_reminder_id VARCHAR(50) DEFAULT NULL,
        last_active_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabel "user_sessions" siap digunakan di PostgreSQL.');
  } catch (error) {
    console.error('Error membuat tabel "user_sessions":', error);
    throw error;
  }

  // 6. Buat tabel user_memories untuk menyimpan memori jangka panjang
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_memories (
        id SERIAL PRIMARY KEY,
        target_jid VARCHAR(100) NOT NULL,
        fact TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabel "user_memories" siap digunakan di PostgreSQL.');
  } catch (error) {
    console.error('Error membuat tabel "user_memories":', error);
    throw error;
  }

  // 7. Buat tabel knowledge_base untuk menyimpan fakta/referensi manual per user
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id SERIAL PRIMARY KEY,
        target_jid VARCHAR(100) NOT NULL,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_base_jid
      ON knowledge_base(target_jid, updated_at DESC);
    `);
    console.log('Tabel "knowledge_base" siap digunakan di PostgreSQL.');
  } catch (error) {
    console.error('Error membuat tabel "knowledge_base":', error);
    throw error;
  }

  // 8. Buat tabel daily_plans untuk planner harian dengan ringkasan pagi otomatis
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_plans (
        id SERIAL PRIMARY KEY,
        target_jid VARCHAR(100) NOT NULL,
        plan_date DATE NOT NULL,
        summary_hour INTEGER NOT NULL,
        summary_minute INTEGER NOT NULL,
        items TEXT[] NOT NULL,
        is_sent BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_plans_jid_date
      ON daily_plans(target_jid, plan_date, is_sent);
    `);
    console.log('Tabel "daily_plans" siap digunakan di PostgreSQL.');
  } catch (error) {
    console.error('Error membuat tabel "daily_plans":', error);
    throw error;
  }
  
  console.log('=== DATABASE INITIALIZATION SUCCESSFUL ===');
}

/**
 * Mendapatkan instance pool koneksi aktif.
 * @returns {Pool}
 */
export function getPool() {
  if (!pool) {
    throw new Error('Database belum diinisialisasi. Panggil initDatabase() terlebih dahulu.');
  }
  return pool;
}
