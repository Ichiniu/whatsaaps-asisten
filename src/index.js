import { startWhatsAppBot } from './bot/client.js';

console.log('=== WA-ASSISTANT STARTING ===');

startWhatsAppBot().catch((err) => {
  console.error('Fatal error starting WhatsApp Bot:', err);
  process.exit(1);
});
