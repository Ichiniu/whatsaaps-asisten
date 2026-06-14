import {
  listActiveReminders,
  deleteReminder,
  stopRecurringReminder
} from '../ai/reminderService.js';

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Memformat satu baris pengingat untuk ditampilkan ke user.
 * @param {object} row - Baris dari database
 * @param {number} index - Nomor urut (1-based)
 * @returns {string}
 */
function formatReminderItem(row, index) {
  const emoji = index <= 9 ? `${index}️⃣` : `${index}.`;

  if (row.cron) {
    // Berulang
    const parts = row.cron.split(' ');
    const minute = parts[0].padStart(2, '0');
    const hour = parts[1].padStart(2, '0');
    const dow = parts[4];

    let recurrenceDesc = 'Setiap hari';
    if (dow !== '*') {
      const dayIdx = parseInt(dow, 10);
      recurrenceDesc = `Setiap hari ${DAYS[dayIdx]}`;
    }

    const status = row.is_sent ? '🔴 Dihentikan' : '🟢 Aktif';
    return `${emoji} *[Berulang]* ${row.message}\n   🔄 ${recurrenceDesc} pukul ${hour}:${minute}\n   ${status}`;
  } else {
    // Sekali jalan
    const timeOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    const formattedTime = new Date(row.time).toLocaleDateString('id-ID', timeOptions);
    return `${emoji} *[Sekali]* ${row.message}\n   📅 ${formattedTime}`;
  }
}

/**
 * Menangani semua perintah !reminder dari WhatsApp.
 * @param {object} sock - Baileys socket
 * @param {object} msg - Pesan masuk
 * @param {string} text - Teks pesan
 */
export async function handleReminderCommand(sock, msg, entities = null) {
  const from = msg.key.remoteJid;
  const rawText = msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text || '';
  const text = rawText.trim();

  let subCommand = 'help';
  let arg = null;

  if (entities && entities.action) {
    subCommand = entities.action;
    arg = entities.targetId !== undefined && entities.targetId !== null ? String(entities.targetId) : null;
  } else {
    // Pecah menjadi bagian-bagian secara manual
    const parts = text.split(/\s+/);
    subCommand = parts[1]?.toLowerCase() || 'help';
    arg = parts[2]; // nomor urut (jika ada)
  }

  // ─── !reminder list ───────────────────────────────────────────────────────
  if (subCommand === 'list' || subCommand === 'daftar') {
    const rows = await listActiveReminders(from);

    if (rows.length === 0) {
      await sock.sendMessage(from, {
        text: '📭 *Tidak ada pengingat aktif* saat ini.\n\nGunakan _ingatkan aku..._ untuk menambah pengingat baru.'
      }, { quoted: msg });
      return;
    }

    const items = rows.map((row, i) => formatReminderItem(row, i + 1));
    const responseText = `📋 *Daftar Pengingat Aktif* (${rows.length})\n\n` + items.join('\n\n');
    await sock.sendMessage(from, { text: responseText }, { quoted: msg });
    return;
  }

  // ─── !reminder hapus <nomor> ──────────────────────────────────────────────
  if (subCommand === 'hapus' || subCommand === 'delete') {
    const num = parseInt(arg, 10);
    if (!arg || isNaN(num) || num < 1) {
      await sock.sendMessage(from, {
        text: '⚠️ Format: *!reminder hapus <nomor>*\nContoh: !reminder hapus 1\n\nGunakan *!reminder list* untuk melihat nomor pengingat.'
      }, { quoted: msg });
      return;
    }

    const rows = await listActiveReminders(from);
    if (num > rows.length) {
      await sock.sendMessage(from, {
        text: `⚠️ Nomor *${num}* tidak ditemukan. Mas Ichsan hanya punya *${rows.length}* pengingat aktif.\n\nGunakan *!reminder list* untuk melihat daftar.`
      }, { quoted: msg });
      return;
    }

    const target = rows[num - 1];
    const deleted = await deleteReminder(from, target.id);
    if (deleted) {
      await sock.sendMessage(from, {
        text: `🗑️ *Pengingat berhasil dihapus!*\n\n👉 *${target.message}*`
      }, { quoted: msg });
    } else {
      await sock.sendMessage(from, {
        text: '⚠️ Gagal menghapus pengingat. Silakan coba lagi.'
      }, { quoted: msg });
    }
    return;
  }

  // ─── !reminder stop <nomor> ───────────────────────────────────────────────
  if (subCommand === 'stop' || subCommand === 'hentikan') {
    const num = parseInt(arg, 10);
    if (!arg || isNaN(num) || num < 1) {
      await sock.sendMessage(from, {
        text: '⚠️ Format: *!reminder stop <nomor>*\nContoh: !reminder stop 2\n\nGunakan *!reminder list* untuk melihat nomor pengingat.'
      }, { quoted: msg });
      return;
    }

    const rows = await listActiveReminders(from);
    if (num > rows.length) {
      await sock.sendMessage(from, {
        text: `⚠️ Nomor *${num}* tidak ditemukan. Mas Ichsan hanya punya *${rows.length}* pengingat aktif.`
      }, { quoted: msg });
      return;
    }

    const target = rows[num - 1];
    if (!target.cron) {
      await sock.sendMessage(from, {
        text: `ℹ️ Pengingat nomor *${num}* bukan pengingat berulang.\nGunakan *!reminder hapus ${num}* untuk menghapusnya.`
      }, { quoted: msg });
      return;
    }

    const stopped = await stopRecurringReminder(from, target.id);
    if (stopped) {
      await sock.sendMessage(from, {
        text: `⏹️ *Pengingat berulang dihentikan!*\n\n👉 *${target.message}*\n\nPengingat ini tidak akan muncul lagi. Data riwayatnya masih tersimpan.`
      }, { quoted: msg });
    } else {
      await sock.sendMessage(from, {
        text: '⚠️ Gagal menghentikan pengingat. Silakan coba lagi.'
      }, { quoted: msg });
    }
    return;
  }

  // ─── !reminder / !reminder help ───────────────────────────────────────────
  const helpText = `📖 *Panduan Perintah Pengingat*

*Lihat Daftar:*
• \`!reminder list\` — tampilkan semua pengingat aktif

*Hapus Pengingat:*
• \`!reminder hapus <nomor>\` — hapus pengingat sekali jalan

*Hentikan Berulang:*
• \`!reminder stop <nomor>\` — hentikan pengingat rutin

*Tambah Pengingat:*
• _ingatkan aku 30 menit lagi minum obat_
• _ingatkan besok jam 09:00 rapat_
• _ingatkan setiap hari jam 07:00 sarapan_
• _ingatkan setiap senin jam 09:00 meeting_`;

  await sock.sendMessage(from, { text: helpText }, { quoted: msg });
}
