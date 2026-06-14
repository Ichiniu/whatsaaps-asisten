import { analyzeMessage } from '../ai/brain.js';
import { routeMessage } from './router.js';
import { getReminderByMsgId, updateReminderByMsgId, deleteReminder } from '../ai/reminderService.js';

/**
 * Mengekstrak teks dari berbagai tipe struktur pesan WhatsApp Baileys.
 * Mendukung deteksi pesan yang diedit (MESSAGE_EDIT).
 * 
 * @param {object} msg 
 * @returns {string|object} Teks pesan, atau objek informasi edit jika pesan diedit
 */
export function getMessageText(msg) {
  if (!msg.message) return '';

  const type = Object.keys(msg.message)[0];

  // Deteksi jika pesan diedit
  if (type === 'protocolMessage') {
    const protocolMsg = msg.message.protocolMessage;
    if (protocolMsg && protocolMsg.type === 14) { // 14 adalah MESSAGE_EDIT di Baileys
      const editedMsg = protocolMsg.editedMessage;
      const newText = editedMsg?.conversation || 
                      editedMsg?.extendedTextMessage?.text || 
                      editedMsg?.imageMessage?.caption || 
                      editedMsg?.videoMessage?.caption || 
                      '';
      return {
        isEdit: true,
        originalMsgId: protocolMsg.key.id,
        newText: newText
      };
    }
  }

  if (type === 'conversation') {
    return msg.message.conversation;
  } else if (type === 'extendedTextMessage') {
    return msg.message.extendedTextMessage.text;
  } else if (type === 'imageMessage') {
    return msg.message.imageMessage.caption || '';
  } else if (type === 'videoMessage') {
    return msg.message.videoMessage.caption || '';
  }

  return '';
}

/**
 * Menangani kasus ketika pengguna mengedit pesan pembuat pengingat di WhatsApp.
 * 
 * @param {object} sock - Baileys socket instance
 * @param {object} msg - Objek pesan dari event
 * @param {object} editInfo - Informasi edit (originalMsgId, newText)
 * @param {boolean} isGroup - Apakah berasal dari grup
 */
export async function handleMessageEdit(sock, msg, editInfo, isGroup) {
  const from = msg.key.remoteJid;
  const { originalMsgId, newText } = editInfo;

  console.log(`[Pesan Diedit] Dari: ${from}, ID Asli: ${originalMsgId}, Teks Baru: "${newText}"`);

  // 1. Cek apakah ada pengingat aktif yang dikaitkan dengan ID pesan WhatsApp asli
  const existingReminder = await getReminderByMsgId(from, originalMsgId);
  if (!existingReminder) {
    // Jika bukan edit pesan pengingat, abaikan saja
    return;
  }

  // 2. Jalankan analisis intent pada teks baru hasil editan
  const analysis = await analyzeMessage(newText, isGroup);

  if (analysis.intent === 'CREATE_REMINDER') {
    // Update pengingat di database
    const { task, datetime, cron } = analysis.entities;

    if (cron) {
      // Pengingat berulang
      await updateReminderByMsgId(originalMsgId, null, task, cron);
      let recurrenceDesc = 'Setiap hari';
      const parts = cron.split(' ');
      const dow = parts[4];
      const hour = parts[1].padStart(2, '0');
      const minute = parts[0].padStart(2, '0');

      if (dow !== '*') {
        const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const dayName = days[parseInt(dow, 10)];
        recurrenceDesc = `Setiap hari ${dayName}`;
      }
      const responseText = `📝 *Pengingat Berhasil Diperbarui!*\n\nSaya mengubah jadwal pengingat Mas Ichsan:\n🔄 *${recurrenceDesc} pukul ${hour}:${minute}*\n\nAgenda Baru:\n👉 *${task}*`;
      await sock.sendMessage(from, { text: responseText }, { quoted: msg });
    } else {
      // Pengingat sekali jalan
      const targetTime = new Date(datetime);
      await updateReminderByMsgId(originalMsgId, targetTime, task, null);

      const timeOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
      const formattedTime = targetTime.toLocaleDateString('id-ID', timeOptions);
      const responseText = `📝 *Pengingat Berhasil Diperbarui!*\n\nSaya mengubah jadwal pengingat Mas Ichsan pada:\n📅 *${formattedTime}*\n\nAgenda Baru:\n👉 *${task}*`;
      await sock.sendMessage(from, { text: responseText }, { quoted: msg });
    }
  } else {
    // Jika diedit menjadi teks biasa (bukan perintah pengingat), batalkan/hapus pengingat tersebut
    const success = await deleteReminder(from, existingReminder.id);
    if (success) {
      const responseText = `🗑️ *Pengingat Dibatalkan!*\n\nKarena Mas Ichsan mengedit pesan tersebut menjadi bukan perintah pengingat, agenda sebelumnya *"${existingReminder.message}"* telah dibatalkan.`;
      await sock.sendMessage(from, { text: responseText }, { quoted: msg });
    }
  }
}

/**
 * Memproses pesan WhatsApp masuk secara modular menggunakan Assistant Brain.
 * @param {object} sock - WhatsApp socket instance dari Baileys
 * @param {object} msg - Objek pesan dari event messages.upsert
 */
export async function handleMessage(sock, msg) {
  const from = msg.key.remoteJid;

  // Abaikan update status WhatsApp
  if (from === 'status@broadcast') return;

  // Abaikan pesan dari bot itu sendiri agar tidak terjadi looping
  if (msg.key.fromMe) return;

  const messageContent = getMessageText(msg);
  if (!messageContent) return;

  const isGroup = from.endsWith('@g.us');

  // Tangani jika pesan merupakan hasil EDIT
  if (typeof messageContent === 'object' && messageContent.isEdit) {
    try {
      await handleMessageEdit(sock, msg, messageContent, isGroup);
    } catch (err) {
      console.error('Error handling message edit in handleMessage:', err);
    }
    return;
  }

  const text = messageContent;
  console.log(`[Pesan Masuk] Dari: ${from}, Isi: "${text}"`);

  try {
    // 1. Jalankan Intent Detection & Entity Extraction (Assistant Brain)
    const analysis = await analyzeMessage(text, isGroup);
    
    // 2. Rutekan pesan ke handler yang sesuai
    await routeMessage(sock, msg, analysis);
  } catch (error) {
    console.error('Error handling message in handleMessage:', error);
  }
}


