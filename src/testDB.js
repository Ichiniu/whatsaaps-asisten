import { initDatabase, getPool } from './database/db.js';

console.log('=== TESTING POSTGRESQL CONNECTION ===');

async function runTest() {
  try {
    await initDatabase();
    
    const pool = getPool();
    console.log('Menguji query SELECT ke tabel reminders...');
    const res = await pool.query('SELECT COUNT(*) FROM reminders');
    console.log('Jumlah baris saat ini di tabel reminders:', res.rows[0].count);
    
    console.log('\n=== DB TEST SUCCESSFUL ===');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ DB TEST FAILED:', error);
    process.exit(1);
  }
}

runTest();
