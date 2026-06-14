import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATABASE_FILE = path.join(__dirname, '../database/reminders.json');

const INDO_MONTHS = {
  januari: 0, jan: 0,
  februari: 1, feb: 1,
  maret: 2, mar: 2,
  april: 3, apr: 3,
  mei: 4,
  juni: 5, jun: 5,
  juli: 6, jul: 6,
  agustus: 7, ags: 7, agt: 7,
  september: 8, sep: 8,
  oktober: 9, okt: 9,
  november: 10, nov: 10,
  desember: 11, des: 11
};

/**
 * Melakukan migrasi data dari file JSON lokal ke database PostgreSQL (jika ada file JSON).
 */
export async function migrateJsonToPostgres() {
  if (!fs.existsSync(DATABASE_FILE)) return;

  try {
    const data = fs.readFileSync(DATABASE_FILE, 'utf8');
    const reminders = JSON.parse(data || '[]');
    
    if (reminders.length > 0) {
      console.log(`[Migration] Menemukan ${reminders.length} data di reminders.json. Memigrasikan ke PostgreSQL...`);
      const pool = getPool();
      
      for (const r of reminders) {
        await pool.query(
          `INSERT INTO reminders (id, target_jid, time, message, is_sent) 
           VALUES ($1, $2, $3, $4, $5) 
           ON CONFLICT (id) DO NOTHING`,
          [r.id, r.targetJid, new Date(r.time), r.message, r.isSent]
        );
      }
      
      console.log('[Migration] Migrasi data ke PostgreSQL berhasil.');
    }

    // Ubah nama file agar tidak dimigrasikan ulang
    const backupPath = `${DATABASE_FILE}.bak`;
    fs.renameSync(DATABASE_FILE, backupPath);
    console.log(`[Migration] File JSON asli telah di-backup ke: ${backupPath}`);
  } catch (error) {
    console.error('[Migration] Gagal melakukan migrasi dari JSON ke PostgreSQL:', error);
  }
}

/**
 * Mengubah string waktu relatif/absolut bahasa Indonesia menjadi objek Date.
 * @param {string} text - Teks setelah kata kunci 'ingatkan aku'/'ingatkan'
 * @returns {object|null} { targetTime: Date, cleanTask: string } atau null jika tidak valid
 */
export function parseReminderText(text) {
  let cleanText = text.trim();
  let targetTime = null;
  let cleanTask = '';

  const now = new Date();

  // 0. Mode 0: Pengingat Berulang / Recurring (Contoh: "setiap hari jam 07:00" atau "setiap senin pukul 09:00")
  const everyRegex = /^setiap\s+(hari|senin|selasa|rabu|kamis|jumat|sabtu|minggu|jam)?\s*(?:jam|pukul)?\s*(\d{1,2})[.:](\d{2})/i;
  const everyMatch = cleanText.match(everyRegex);

  if (everyMatch) {
    const day = everyMatch[1] ? everyMatch[1].toLowerCase() : 'hari';
    const hour = parseInt(everyMatch[2], 10);
    const minute = parseInt(everyMatch[3], 10);

    const dayMap = {
      senin: '1',
      selasa: '2',
      rabu: '3',
      kamis: '4',
      jumat: '5',
      sabtu: '6',
      minggu: '0'
    };

    let dayOfWeek = '*';
    if (dayMap[day]) {
      dayOfWeek = dayMap[day];
    }

    const cronExpression = `${minute} ${hour} * * ${dayOfWeek}`;

    let targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    if (dayOfWeek !== '*') {
      const targetDow = parseInt(dayOfWeek, 10);
      let diff = targetDow - now.getDay();
      if (diff < 0 || (diff === 0 && targetTime.getTime() <= now.getTime())) {
        diff += 7;
      }
      targetTime.setDate(targetTime.getDate() + diff);
    } else {
      if (targetTime.getTime() <= now.getTime()) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
    }

    let rawTask = cleanText
      .replace(everyMatch[0], '')
      .replace(/\s+(untuk|buat)\s*$/gi, '')
      .trim();

    cleanTask = cleanPrepositions(rawTask);

    return { targetTime, cleanTask, cron: cronExpression };
  }

  // 1. Mode 1: Tanggal & Jam Lengkap (Contoh: "14 Desember 2026 pukul 12:00" atau "14-12-2026 12:00")
  const dateMonthYearRegex = /(\d{1,2})\s+(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(\d{4})/i;
  const dateNumberRegex = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/i;
  const timeRegex = /(?:pukul|jam)?\s*(\d{1,2})[.:](\d{2})/i;

  let dateMatch = cleanText.match(dateMonthYearRegex);
  let isMonthText = true;
  if (!dateMatch) {
    dateMatch = cleanText.match(dateNumberRegex);
    isMonthText = false;
  }

  const timeMatch = cleanText.match(timeRegex);

  if (dateMatch) {
    let day = parseInt(dateMatch[1]);
    let month = 0;
    let year = parseInt(dateMatch[3]);

    if (isMonthText) {
      const monthStr = dateMatch[2].toLowerCase();
      month = INDO_MONTHS[monthStr];
    } else {
      month = parseInt(dateMatch[2]) - 1;
    }

    // Jika tidak ada info jam, default ke jam 08:00 pagi
    let hour = 8;
    let minute = 0;

    if (timeMatch) {
      hour = parseInt(timeMatch[1]);
      minute = parseInt(timeMatch[2]);
    }

    targetTime = new Date(year, month, day, hour, minute, 0);

    // Bersihkan info waktu dari teks
    let rawTask = cleanText
      .replace(dateMatch[0], '')
      .replace(timeMatch ? timeMatch[0] : '', '')
      // Hapus sisa rentang waktu seperti "-24.00" atau "s.d 12:00" jika ada
      .replace(/[-–—]\s*\d{1,2}[.:]\d{2}/g, '')
      .replace(/\s+s\.?d\.?\s*\d{1,2}[.:]\d{2}/gi, '')
      .replace(/\b(pada tanggal|tanggal|pada|pukul|jam|di|mulai|ke|untuk|buat)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    cleanTask = cleanPrepositions(rawTask);
    return { targetTime, cleanTask };
  }

  // 2. Mode 2: Waktu Relatif (Contoh: "10 menit lagi", "2 jam lagi", "10m", "2h")
  const relativeRegex = /(\d+)\s*(menit lagi|menit|m|jam lagi|jam|h|hari lagi|hari|d)\b/i;
  const relativeMatch = cleanText.match(relativeRegex);

  if (relativeMatch) {
    const value = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    let durationMs = 0;

    if (unit.startsWith('menit') || unit === 'm') {
      durationMs = value * 60 * 1000;
    } else if (unit.startsWith('jam') || unit === 'h') {
      durationMs = value * 60 * 60 * 1000;
    } else if (unit.startsWith('hari') || unit === 'd') {
      durationMs = value * 24 * 60 * 60 * 1000;
    }

    if (durationMs > 0) {
      targetTime = new Date(now.getTime() + durationMs);
      let rawTask = cleanText
        .replace(relativeMatch[0], '')
        .replace(/\s+(untuk|buat)\s*$/gi, '')
        .trim();

      cleanTask = cleanPrepositions(rawTask);
      return { targetTime, cleanTask };
    }
  }

  // 3. Mode 3: Jam Spesifik Hari Ini / Besok (Contoh: "besok jam 12:00" atau "jam 08:30")
  const tomorrowRegex = /\bbesok\b/i;
  const isTomorrow = tomorrowRegex.test(cleanText);

  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]);

    targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    
    // Jika waktunya sudah terlewat untuk hari ini, set ke besok
    if (targetTime.getTime() <= now.getTime() || isTomorrow) {
      targetTime.setDate(targetTime.getDate() + 1);
    }

    let rawTask = cleanText
      .replace(timeMatch[0], '')
      .replace(tomorrowRegex, '')
      .replace(/\s+(pada|pukul|jam|untuk|buat)\s*$/gi, '')
      .trim();

    cleanTask = cleanPrepositions(rawTask);
    return { targetTime, cleanTask };
  }

  return null;
}

/**
 * Membersihkan kata depan bahasa Indonesia di awal tugas agar terdengar lebih rapi.
 * @param {string} task 
 */
function cleanPrepositions(task) {
  return task
    .replace(/^(buat|untuk|ada|kegiatan|agenda|daerah)\s+/gi, '')
    .replace(/^(buat|untuk|ada|kegiatan|agenda|daerah)\s+/gi, '')
    .trim();
}

/**
 * Menambahkan pengingat baru ke database PostgreSQL.
 * @param {string} targetJid - WhatsApp ID penerima
 * @param {Date} targetTime - Waktu pengingat dikirim
 * @param {string} message - Pesan pengingat
 * @param {string|null} cron - Ekspresi cron jika pengingat berulang
 * @returns {Promise<object>} Pengingat yang berhasil dibuat
 */
export async function addReminder(targetJid, targetTime, message, cron = null, whatsappMsgId = null) {
  const pool = getPool();
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
  
  await pool.query(
    `INSERT INTO reminders (id, target_jid, time, message, is_sent, cron, whatsapp_msg_id) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, targetJid, targetTime, message, false, cron, whatsappMsgId]
  );

  return {
    id,
    targetJid,
    time: targetTime ? targetTime.toISOString() : null,
    message,
    isSent: false,
    cron,
    whatsappMsgId
  };
}

/**
 * Cocokkan ekspresi cron sederhana dengan waktu saat ini.
 * @param {string} cronExpression 
 * @param {Date} date 
 * @returns {boolean}
 */
export function matchesCron(cronExpression, date) {
  const parts = cronExpression.split(/\s+/);
  if (parts.length !== 5) return false;

  const [cronMin, cronHour, cronDOM, cronMonth, cronDOW] = parts;

  const min = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay();

  const matchField = (cronVal, currentVal, isDOW = false) => {
    if (cronVal === '*') return true;
    const values = cronVal.split(',');
    for (const val of values) {
      if (isDOW) {
        let v = parseInt(val, 10);
        if (v === 7) v = 0;
        if (v === currentVal) return true;
      } else {
        if (parseInt(val, 10) === currentVal) return true;
      }
    }
    return false;
  };

  return (
    matchField(cronMin, min) &&
    matchField(cronHour, hour) &&
    matchField(cronDOM, dom) &&
    matchField(cronMonth, month) &&
    matchField(cronDOW, dow, true)
  );
}

/**
 * Memeriksa pengingat yang jatuh tempo di PostgreSQL dan mengirimkannya menggunakan socket Baileys.
 * @param {object} sock - Baileys socket instance
 */
/**
 * Menyimpan ID pengingat terakhir yang dikirim ke user_sessions untuk mendukung fitur snooze.
 * @param {string} targetJid 
 * @param {string} reminderId 
 */
export async function updateLastFiredReminder(targetJid, reminderId) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO user_sessions (target_jid, last_fired_reminder_id, last_active_time)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (target_jid) 
     DO UPDATE SET last_fired_reminder_id = EXCLUDED.last_fired_reminder_id, last_active_time = EXCLUDED.last_active_time`,
    [targetJid, reminderId]
  );
}

/**
 * Mendapatkan data pengingat terakhir yang dikirim ke user.
 * @param {string} targetJid 
 * @returns {Promise<object|null>}
 */
export async function getLastFiredReminder(targetJid) {
  const pool = getPool();
  const sessionRes = await pool.query(
    `SELECT last_fired_reminder_id FROM user_sessions WHERE target_jid = $1`,
    [targetJid]
  );
  
  if (sessionRes.rowCount === 0 || !sessionRes.rows[0].last_fired_reminder_id) {
    return null;
  }
  
  const reminderId = sessionRes.rows[0].last_fired_reminder_id;
  const reminderRes = await pool.query(
    `SELECT id, target_jid, time, message, cron FROM reminders WHERE id = $1`,
    [reminderId]
  );
  
  return reminderRes.rowCount > 0 ? reminderRes.rows[0] : null;
}

/**
 * Memeriksa pengingat yang jatuh tempo di PostgreSQL dan mengirimkannya menggunakan socket Baileys.
 * @param {object} sock - Baileys socket instance
 */
export async function checkAndSendReminders(sock) {
  const pool = getPool();
  const now = new Date();

  try {
    const res = await pool.query(
      `SELECT id, target_jid, time, message, cron, last_fired 
       FROM reminders 
       WHERE (is_sent = false AND cron IS NULL AND time <= $1) 
          OR (cron IS NOT NULL)`,
      [now]
    );

    for (const row of res.rows) {
      try {
        if (row.cron) {
          if (!matchesCron(row.cron, now)) {
            continue;
          }

          if (row.last_fired) {
            const lastFiredDate = new Date(row.last_fired);
            if (
              lastFiredDate.getFullYear() === now.getFullYear() &&
              lastFiredDate.getMonth() === now.getMonth() &&
              lastFiredDate.getDate() === now.getDate() &&
              lastFiredDate.getHours() === now.getHours() &&
              lastFiredDate.getMinutes() === now.getMinutes()
            ) {
              continue;
            }
          }

          console.log(`[Reminder Berulang] Mengirim pengingat ke ${row.target_jid}: "${row.message}"`);
          const textMessage = `🔔 *PENGINGAT BERULANG* 🔔\n\nHalo Mas Ichsan, ini pengingat rutin Anda:\n👉 *${row.message}*\n\n_(Balas pesan ini dengan "tunda 10 menit" atau "nanti 1 jam lagi" jika ingin menunda)_`;
          await sock.sendMessage(row.target_jid, { text: textMessage });

          await pool.query(
            `UPDATE reminders SET last_fired = $1 WHERE id = $2`,
            [now, row.id]
          );
          
          // Simpan sesi pengingat terakhir
          await updateLastFiredReminder(row.target_jid, row.id);
        } else {
          console.log(`[Reminder] Mengirim pengingat ke ${row.target_jid}: "${row.message}"`);
          const textMessage = `🔔 *PENGINGAT* 🔔\n\nHalo Mas Ichsan, ini pengingat untuk agenda Anda:\n👉 *${row.message}*\n\n_(Balas pesan ini dengan "tunda 10 menit" atau "nanti 1 jam lagi" jika ingin menunda)_`;
          await sock.sendMessage(row.target_jid, { text: textMessage });

          await pool.query(
            `UPDATE reminders SET is_sent = true WHERE id = $1`,
            [row.id]
          );

          // Simpan sesi pengingat terakhir
          await updateLastFiredReminder(row.target_jid, row.id);
        }
      } catch (sendErr) {
        console.error(`Gagal mengirim pengingat id ${row.id}:`, sendErr);
      }
    }
  } catch (error) {
    console.error('Error saat memeriksa reminders di PostgreSQL:', error);
  }
}

/**
 * Mengambil semua pengingat aktif milik satu JID.
 * @param {string} targetJid
 * @returns {Promise<Array>}
 */
export async function listActiveReminders(targetJid) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, time, message, cron, is_sent
     FROM reminders
     WHERE target_jid = $1
       AND (is_sent = false OR cron IS NOT NULL)
     ORDER BY created_at ASC`,
    [targetJid]
  );
  return res.rows;
}

/**
 * Menghapus pengingat berdasarkan ID dan JID pemilik.
 * @param {string} targetJid
 * @param {string} id
 * @returns {Promise<boolean>} true jika berhasil dihapus
 */
export async function deleteReminder(targetJid, id) {
  const pool = getPool();
  const res = await pool.query(
    `DELETE FROM reminders WHERE id = $1 AND target_jid = $2`,
    [id, targetJid]
  );
  return res.rowCount > 0;
}

/**
 * Menghentikan pengingat berulang (cron) dengan menandai is_sent = true.
 * @param {string} targetJid
 * @param {string} id
 * @returns {Promise<boolean>} true jika berhasil dihentikan
 */
export async function stopRecurringReminder(targetJid, id) {
  const pool = getPool();
  const res = await pool.query(
    `UPDATE reminders SET is_sent = true WHERE id = $1 AND target_jid = $2 AND cron IS NOT NULL`,
    [id, targetJid]
  );
  return res.rowCount > 0;
}

/**
 * Memproses penundaan (snooze) untuk pengingat yang baru saja dikirim.
 * Jika pengingat sekali jalan, perbarui waktu targetnya.
 * Jika pengingat berulang, buat pengingat sekali jalan baru sebagai kloningan tunda.
 * 
 * @param {string} targetJid 
 * @param {object} lastFired 
 * @param {Date} snoozeTime 
 */
export async function snoozeReminder(targetJid, lastFired, snoozeTime) {
  const pool = getPool();
  if (!lastFired.cron) {
    // Sekali jalan: perbarui waktu target dan set is_sent = false
    await pool.query(
      `UPDATE reminders SET time = $1, is_sent = false WHERE id = $2`,
      [snoozeTime, lastFired.id]
    );
  } else {
    // Berulang: buat pengingat kloning sekali jalan untuk waktu tunda
    await addReminder(targetJid, snoozeTime, lastFired.message, null);
  }
}

/**
 * Mendapatkan pengingat aktif berdasarkan whatsapp_msg_id.
 * 
 * @param {string} targetJid 
 * @param {string} whatsappMsgId 
 * @returns {Promise<object|null>}
 */
export async function getReminderByMsgId(targetJid, whatsappMsgId) {
  const pool = getPool();
  try {
    const res = await pool.query(
      `SELECT id, target_jid, time, message, cron, is_sent, whatsapp_msg_id
       FROM reminders
       WHERE target_jid = $1 AND whatsapp_msg_id = $2`,
      [targetJid, whatsappMsgId]
    );
    return res.rowCount > 0 ? res.rows[0] : null;
  } catch (err) {
    console.error('Error getting reminder by MsgID:', err);
    return null;
  }
}

/**
 * Memperbarui pengingat berdasarkan whatsapp_msg_id.
 * 
 * @param {string} whatsappMsgId 
 * @param {Date|null} targetTime 
 * @param {string} message 
 * @param {string|null} cron 
 */
export async function updateReminderByMsgId(whatsappMsgId, targetTime, message, cron) {
  const pool = getPool();
  try {
    await pool.query(
      `UPDATE reminders 
       SET time = $1, message = $2, cron = $3, is_sent = false, last_fired = null
       WHERE whatsapp_msg_id = $4`,
      [targetTime, message, cron, whatsappMsgId]
    );
  } catch (err) {
    console.error('Error updating reminder by MsgID:', err);
    throw err;
  }
}
