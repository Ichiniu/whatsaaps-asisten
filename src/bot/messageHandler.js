import { generateAIResponse } from '../ai/gemini.js';

/**
 * Mengekstrak teks dari berbagai tipe struktur pesan WhatsApp Baileys.
 * @param {object} msg 
 * @returns {string}
 */
export function getMessageText(msg) {
  if (!msg.message) return '';
  
  const type = Object.keys(msg.message)[0];
  
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
 * Memproses pesan WhatsApp masuk secara modular.
 * @param {object} sock - WhatsApp socket instance dari Baileys
 * @param {object} msg - Objek pesan dari event messages.upsert
 */
export async function handleMessage(sock, msg) {
  const from = msg.key.remoteJid;
  
  // Abaikan update status WhatsApp
  if (from === 'status@broadcast') return;
  
  // Abaikan pesan dari bot itu sendiri agar tidak terjadi looping
  if (msg.key.fromMe) return;

  const text = getMessageText(msg);
  if (!text) return;

  console.log(`[Pesan Masuk] Dari: ${from}, Isi: "${text}"`);

  // Rute 1: Jika diawali prefix !ai, lempar ke Gemini AI
  if (text.startsWith('!ai')) {
    // Bersihkan prefix !ai dari teks prompt
    const prompt = text.slice(3).trim();
    
    if (!prompt) {
      await sock.sendMessage(from, { text: '[Bot Gemini]: Silakan masukkan pertanyaan setelah prefix !ai. Contoh: !ai Apa itu Redis?' }, { quoted: msg });
      return;
    }

    // Tampilkan status "sedang mengetik" ke WhatsApp (UX Micro-interaction)
    await sock.sendPresenceUpdate('composing', from);

    try {
      const response = await generateAIResponse(prompt);
      await sock.sendMessage(from, { text: response }, { quoted: msg });
    } catch (err) {
      console.error('Error handling Gemini command:', err);
      await sock.sendMessage(from, { text: `[Bot Gemini Error]: Gagal mendapatkan respon. (${err.message})` }, { quoted: msg });
    }
    return;
  }

  // Rute 2: Echo Bot (Untuk pesan non-!ai, kita abaikan saja atau bisa digunakan untuk debug)
  // Untuk menghindari spam, kita matikan echo bot default, atau Anda bisa membukanya kembali jika perlu.
  // const replyText = `[Bot Echo]: ${text}`;
  // await sock.sendMessage(from, { text: replyText }, { quoted: msg });
}
