import { analyzeMessage } from '../ai/brain.js';
import { routeMessage } from './router.js';
import { handleReminderText } from '../reminder/reminderService.js';
import { extractTextFromMessage } from './messageText.js';

/**
 * Memproses pesan WhatsApp masuk secara modular menggunakan Assistant Brain.
 * Untuk reminder/jadwal, parser + database menjadi sumber kebenaran utama.
 *
 * @param {object} sock - WhatsApp socket instance dari Baileys
 * @param {object} msg - Objek pesan dari event messages.upsert/messages.update
 * @param {object} options
 * @param {boolean} options.isEdit
 */
export async function handleMessage(sock, msg, options = {}) {
  const from = msg?.key?.remoteJid;
  const isEdit = options.isEdit === true;

  if (!from) return;

  // Abaikan update status WhatsApp
  if (from === 'status@broadcast') return;

  // Abaikan pesan dari bot itu sendiri agar tidak looping
  if (msg?.key?.fromMe) return;

  const text = extractTextFromMessage(msg.message);
  if (!text) return;

  console.log(`[Pesan ${isEdit ? 'Edit' : 'Masuk'}] Dari: ${from}, Isi: "${text}"`);

  try {
    const reminderReply = await handleReminderText({
      text,
      messageKey: msg.key,
      isEdit
    });

    if (reminderReply) {
      const replyText = isEdit
        ? `Pesan kamu terdeteksi diedit.\n\n${reminderReply}`
        : reminderReply;

      await sock.sendMessage(from, { text: replyText }, { quoted: msg });
      return;
    }
  } catch (err) {
    console.error(`Error ${isEdit ? 'messages.update' : 'messages.upsert'} reminder handling:`, err);
  }

  if (isEdit) {
    return;
  }

  const isGroup = from.endsWith('@g.us');

  try {
    const analysis = await analyzeMessage(text, isGroup);
    await routeMessage(sock, msg, analysis);
  } catch (error) {
    console.error('Error handling message in handleMessage:', error);
  }
}