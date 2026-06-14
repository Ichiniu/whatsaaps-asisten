import { startWhatsAppBot } from './bot/client.js';
import { initDatabase } from './database/db.js';
import { migrateJsonToPostgres } from './ai/reminderService.js';

console.log('=== WA-ASSISTANT STARTING ===');

async function main() {
  // 1. Inisialisasi Database PostgreSQL
  await initDatabase();
  
  // 2. Jalankan migrasi data lama (JSON ke PostgreSQL)
  await migrateJsonToPostgres();

  // 3. Jalankan client WhatsApp Bot
  await startWhatsAppBot();
}

main().catch((err) => {
  console.error('Fatal error starting WhatsApp Bot:', err);
  process.exit(1);
});

