import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { handleMessage } from './messageHandler.js';
import { checkAndSendDailyPlans } from '../ai/plannerService.js';
import { startReminderScheduler, stopReminderScheduler } from '../scheduler/reminderScheduler.js';

dotenv.config();

const logger = pino({ level: process.env.LOG_LEVEL || 'error' });
const baileysLogger = pino({ level: 'silent' });
let reminderInterval = null;

export async function startWhatsAppBot() {
  const sessionDir = process.env.SESSION_DIR || './auth_info';
  logger.info(`Menginisialisasi session di folder: ${sessionDir}`);
  
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: baileysLogger
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n=== SCAN QR CODE UNTUK LOGIN ===');
      qrcode.generate(qr, { small: true });
      console.log('================================\n');

      // Simpan QR Code ke file gambar PNG di folder artifacts
      const qrPath = 'C:/Users/chzan_1q5xbl/.gemini/antigravity-ide/brain/1b2eaf79-37b9-426a-ab6d-1c19af6f8131/qrcode.png';
      QRCode.toFile(qrPath, qr, {
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 300
      }, (err) => {
        if (err) logger.error('Gagal menyimpan QR Code ke gambar:', err);
        else logger.info(`QR Code disimpan ke gambar: ${qrPath}`);
      });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      logger.error(`Koneksi terputus. Status code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
      
      // Hentikan interval scheduler jika koneksi ditutup
      if (reminderInterval) {
        reminderInterval.stop();
        reminderInterval = null;
      }
      stopReminderScheduler();

      if (shouldReconnect) {
        startWhatsAppBot();
      }
    } else if (connection === 'open') {
      logger.info('Koneksi WhatsApp sukses terhubung!');
      
      // Jalankan scheduler planner harian dan scheduler reminder database
      if (reminderInterval) {
        reminderInterval.stop();
      }
      reminderInterval = cron.schedule('* * * * *', async () => {
        await checkAndSendDailyPlans(sock);
      });
      startReminderScheduler(sock);
    }
  });


  sock.ev.on('messages.upsert', async (m) => {
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        try {
          await handleMessage(sock, msg);
        } catch (err) {
          logger.error('Error handling message:', err);
        }
      }
    }
  });

  sock.ev.on('messages.update', async (updates) => {
    for (const update of updates) {
      try {
        if (update.update?.message) {
          await handleMessage(sock, {
            key: update.key,
            message: update.update.message
          }, {
            isEdit: true
          });
        }
      } catch (err) {
        logger.error('Error handling message update:', err);
      }
    }
  });

  return sock;
}
