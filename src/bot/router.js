import os from 'os';
import { generateAIResponse } from '../ai/gemini.js';
import { addReminder, getLastFiredReminder, snoozeReminder } from '../ai/reminderService.js';
import { handleReminderCommand } from './reminderCommands.js';
import { getHistory, saveMessage, clearHistory } from '../ai/conversationService.js';
import { getMemories, deleteMemory, extractAndSaveMemories } from '../ai/memoryService.js';
import { getPool } from '../database/db.js';

/**
 * Mengarahkan pesan ke layanan/handler yang tepat berdasarkan intent dan entitas yang dianalisis.
 * 
 * @param {object} sock - WhatsApp socket instance dari Baileys
 * @param {object} msg - Objek pesan dari WhatsApp
 * @param {object} analysis - Hasil analisis intent & entitas dari brain.js
 */
export async function routeMessage(sock, msg, analysis) {
  const from = msg.key.remoteJid;
  const { intent, entities, source } = analysis;

  console.log(`[Router] Intent: ${intent}, Source: ${source}`);

  switch (intent) {
    case 'IGNORE':
      // Abaikan pesan (misal pesan di grup tanpa trigger)
      return;

    case 'HELP':
      // Tampilkan bantuan umum
      const helpText = `👋 *Halo Mas Ichsan! Saya Asisten Pribadi Anda.*\n\nBerikut adalah cara menggunakan saya:\n\n💬 *Tanya Jawab AI:*\n• Ketik langsung pesan apa saja di chat ini untuk mengobrol dengan asisten.\n• Gunakan *!ai clear* untuk menghapus memori percakapan kita.\n• Gunakan *!ai memory* untuk melihat fakta yang diingat asisten.\n• Gunakan *!ai forget <nomor>* untuk menghapus ingatan tertentu.\n\n⏰ *Sistem Pengingat:*\n• Ketik secara alami: _"ingatkan aku besok jam 8 pagi beli susu"_ atau _"ingetin nanti malam jam 7 rapat"_\n• Pengingat Rutin/Berulang: _"ingatkan setiap hari jam 07:00 sarapan"_\n\n📋 *Manajemen Pengingat:*\n• *!reminder list* — Tampilkan semua pengingat aktif\n• *!reminder hapus <nomor>* — Hapus pengingat sekali jalan\n• *!reminder stop <nomor>* — Hentikan pengingat berulang\n• *!reminder help* — Tampilkan panduan lengkap pengingat`;
      await sock.sendMessage(from, { text: helpText }, { quoted: msg });
      break;

    case 'CLEAR_CHAT':
      const deleted = await clearHistory(from);
      await sock.sendMessage(from, {
        text: `🗑️ *Riwayat percakapan dihapus!*\n\n${deleted} pesan telah dibersihkan. Kita mulai percakapan baru dari awal.`
      }, { quoted: msg });
      break;

    case 'MANAGE_REMINDER':
      // Salurkan ke handler perintah pengingat
      await handleReminderCommand(sock, msg, entities);
      break;

    case 'SNOOZE_REMINDER':
      const lastFired = await getLastFiredReminder(from);
      if (!lastFired) {
        await sock.sendMessage(from, { text: '⚠️ *Tidak ada pengingat* yang baru saja berbunyi untuk ditunda.' }, { quoted: msg });
        return;
      }

      const { duration, unit } = entities;
      const now = new Date();
      let durationMs = duration * 60 * 1000;
      if (unit === 'jam') {
        durationMs = duration * 60 * 60 * 1000;
      }

      const snoozeTime = new Date(now.getTime() + durationMs);
      await snoozeReminder(from, lastFired, snoozeTime);

      const timeOptions = { hour: '2-digit', minute: '2-digit' };
      const formattedSnoozeTime = snoozeTime.toLocaleTimeString('id-ID', timeOptions);

      const snoozeConfText = `⏹️ *Pengingat Ditunda!*\n\nAgenda:\n👉 *${lastFired.message}*\n\nBerhasil ditunda selama *${duration} ${unit}*. Saya akan mengingatkan Mas Ichsan kembali pada pukul *${formattedSnoozeTime}*.`;
      await sock.sendMessage(from, { text: snoozeConfText }, { quoted: msg });
      break;

    case 'MANAGE_MEMORY':
      const memoryAction = entities.action;
      
      if (memoryAction === 'list') {
        const memories = await getMemories(from);
        if (memories.length === 0) {
          await sock.sendMessage(from, { text: '📭 *Saya belum mengingat fakta* apa pun tentang Mas Ichsan.\n\nMemori akan bertambah otomatis dari percakapan kita!' }, { quoted: msg });
          return;
        }

        const items = memories.map((m, idx) => {
          const emoji = idx + 1 <= 9 ? `${idx + 1}️⃣` : `${idx + 1}.`;
          return `${emoji} ${m.fact}`;
        });
        const responseText = `🧠 *Memori Jangka Panjang tentang Mas Ichsan*\n\nBerikut fakta/preferensi yang saya ingat:\n\n${items.join('\n')}\n\n💡 _Gunakan *!ai forget <nomor>* jika ingin saya melupakan fakta tertentu._`;
        await sock.sendMessage(from, { text: responseText }, { quoted: msg });
      } 
      
      else if (memoryAction === 'forget') {
        const targetNo = entities.targetId;
        if (!targetNo || isNaN(targetNo) || targetNo < 1) {
          await sock.sendMessage(from, { text: '⚠️ Format salah. Gunakan: *!ai forget <nomor_urut>*\nContoh: !ai forget 1' }, { quoted: msg });
          return;
        }

        const memories = await getMemories(from);
        if (targetNo > memories.length) {
          await sock.sendMessage(from, { text: `⚠️ Nomor urut *${targetNo}* tidak ditemukan. Mas Ichsan hanya memiliki *${memories.length}* ingatan aktif.` }, { quoted: msg });
          return;
        }

        const targetMemory = memories[targetNo - 1];
        const success = await deleteMemory(from, targetMemory.id);
        if (success) {
          await sock.sendMessage(from, { text: `🗑️ *Saya sudah melupakan fakta berikut:*\n\n👉 "${targetMemory.fact}"` }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { text: '⚠️ Gagal melupakan ingatan. Silakan coba lagi.' }, { quoted: msg });
        }
      }
      break;

    case 'CREATE_REMINDER':
      // Salurkan ke pembuatan pengingat
      const { task, datetime, cron } = entities;
      const msgId = msg.key.id;

      if (!task || (!datetime && !cron)) {
        const errorText = `⚠️ *Format Pengingat Kurang Tepat*\n\nPastikan menyertakan agenda dan waktu yang jelas. Contoh:\n• _ingatkan aku besok jam 12:00 rapat_\n• _ingatkan setiap hari jam 07:00 sarapan_`;
        await sock.sendMessage(from, { text: errorText }, { quoted: msg });
        return;
      }

      if (cron) {
        // Pengingat berulang
        await addReminder(from, null, task, cron, msgId);
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
        const responseText = `⏰ *Pengingat Berulang Berhasil Disimpan!*\n\nSaya akan mengingatkan Mas Ichsan:\n🔄 *${recurrenceDesc} pukul ${hour}:${minute}*\n\nAgenda:\n👉 *${task}*\n\n_(Terdeteksi via ${source === 'groq_ai' ? 'AI Brain' : 'Parser Lokal'})_`;
        await sock.sendMessage(from, { text: responseText }, { quoted: msg });
      } else {
        // Pengingat sekali jalan
        const targetTime = new Date(datetime);
        await addReminder(from, targetTime, task, null, msgId);

        const timeOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        const formattedTime = targetTime.toLocaleDateString('id-ID', timeOptions);
        const responseText = `⏰ *Pengingat Berhasil Disimpan!*\n\nSaya akan mengingatkan Mas Ichsan pada:\n📅 *${formattedTime}*\n\nAgenda:\n👉 *${task}*\n\n_(Terdeteksi via ${source === 'groq_ai' ? 'AI Brain' : 'Parser Lokal'})_`;
        await sock.sendMessage(from, { text: responseText }, { quoted: msg });
      }
      break;

    case 'SERVER_STATUS':
      try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const ramUsage = `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`;
        
        const botUptimeSec = process.uptime();
        const botUptime = `${(botUptimeSec / 3600).toFixed(2)} jam (${(botUptimeSec / 60).toFixed(0)} menit)`;
        
        // Cek status database
        const pool = getPool();
        const startDb = Date.now();
        await pool.query('SELECT 1');
        const dbLatency = Date.now() - startDb;

        const activeRemindersRes = await pool.query(
          `SELECT COUNT(*) FROM reminders WHERE is_sent = false OR cron IS NOT NULL`
        );
        const activeCount = activeRemindersRes.rows[0].count;

        const statusText = `🖥️ *Status Kesehatan Server & Bot* 🖥️\n\n` +
          `🤖 *Bot Uptime:* ${botUptime}\n` +
          `💾 *Penggunaan RAM:* ${ramUsage}\n` +
          `🗄️ *Status Database:* 🟢 Terhubung (${dbLatency}ms latency)\n` +
          `⏰ *Pengingat Aktif:* ${activeCount} agenda terdaftar\n` +
          `⚡ *Ping Latency:* ${(Date.now() - (msg.messageTimestamp * 1000))}ms`;

        await sock.sendMessage(from, { text: statusText }, { quoted: msg });
      } catch (err) {
        console.error('Error fetching server status:', err);
        await sock.sendMessage(from, { text: `⚠️ Gagal mengambil status server: ${err.message}` }, { quoted: msg });
      }
      break;

    case 'CHAT_AI':
      // Salurkan ke tanya jawab AI (Groq Llama 3.1)
      let prompt = entities.prompt;
      if (!prompt) {
        // Jika tidak ada prompt di entities, ambil teks asli (bersihkan prefix !ai jika ada)
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        prompt = text.startsWith('!ai') ? text.slice(3).trim() : text.trim();
      }

      if (!prompt) {
        await sock.sendMessage(from, { text: '❓ Silakan masukkan pertanyaan Anda.' }, { quoted: msg });
        return;
      }

      // UX Tampilkan status mengetik
      await sock.sendPresenceUpdate('composing', from);

      try {
        const history = await getHistory(from);
        const response = await generateAIResponse(prompt, history, from); // Meneruskan 'from' untuk mengambil memori jangka panjang
        
        await sock.sendMessage(from, { text: response }, { quoted: msg });

        // Simpan percakapan
        await saveMessage(from, 'user', prompt);
        await saveMessage(from, 'assistant', response);

        // Ekstrak fakta baru di latar belakang (asinkron) secara aman
        extractAndSaveMemories(from, prompt, response).catch(err => {
          console.error('Error in background memory extraction:', err);
        });
      } catch (err) {
        console.error('Error handling AI response in Router:', err);
        await sock.sendMessage(from, { text: `[Bot AI Error]: Gagal mendapatkan respon. (${err.message})` }, { quoted: msg });
      }
      break;

    default:
      console.warn(`[Router] Intent tidak dikenal: ${intent}`);
      break;
  }
}
