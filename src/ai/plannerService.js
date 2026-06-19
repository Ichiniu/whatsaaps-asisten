import { getPool } from '../database/db.js';

/**
 * Mengubah input waktu "07:00" menjadi jam & menit.
 * @param {string} timeText
 * @returns {{ hour: number, minute: number } | null}
 */
function parseSummaryTime(timeText) {
  if (!timeText) return null;
  const match = timeText.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

/**
 * Mengubah teks item plan menjadi array agenda.
 * Contoh:
 * "review task, meeting tim, follow up client"
 * @param {string} rawItems
 * @returns {string[]}
 */
function parsePlanItems(rawItems) {
  if (!rawItems) return [];

  return rawItems
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * Menghasilkan tanggal target planner.
 * Saat ini mendukung "besok" atau fallback ke hari ini.
 * @param {string} dayLabel
 * @returns {Date}
 */
function resolvePlanDate(dayLabel) {
  const now = new Date();
  const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  if ((dayLabel || '').toLowerCase() === 'besok') {
    baseDate.setDate(baseDate.getDate() + 1);
  }

  return baseDate;
}

/**
 * Format tanggal YYYY-MM-DD dari Date lokal.
 * @param {Date} date
 * @returns {string}
 */
function toDateOnly(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Menyimpan planner harian baru.
 * Format input:
 * - !plan besok 07:00 | item1, item2, item3
 * @param {string} targetJid
 * @param {string} dayLabel
 * @param {string} summaryTimeText
 * @param {string} rawItems
 * @returns {Promise<object|null>}
 */
export async function addDailyPlan(targetJid, dayLabel, summaryTimeText, rawItems) {
  const summaryTime = parseSummaryTime(summaryTimeText);
  const items = parsePlanItems(rawItems);

  if (!summaryTime || items.length === 0) {
    return null;
  }

  const planDate = resolvePlanDate(dayLabel);
  const pool = getPool();

  const res = await pool.query(
    `INSERT INTO daily_plans (
      target_jid,
      plan_date,
      summary_hour,
      summary_minute,
      items,
      is_sent
    ) VALUES ($1, $2, $3, $4, $5, false)
    RETURNING id, target_jid, plan_date, summary_hour, summary_minute, items, is_sent, created_at`,
    [targetJid, toDateOnly(planDate), summaryTime.hour, summaryTime.minute, items]
  );

  return res.rows[0] || null;
}

/**
 * Mengambil daftar planner aktif milik user.
 * @param {string} targetJid
 * @returns {Promise<Array>}
 */
export async function listDailyPlans(targetJid) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT id, plan_date, summary_hour, summary_minute, items, is_sent, created_at
     FROM daily_plans
     WHERE target_jid = $1
     ORDER BY plan_date ASC, created_at ASC`,
    [targetJid]
  );
  return res.rows;
}

/**
 * Mengambil planner untuk hari ini milik user.
 * @param {string} targetJid
 * @returns {Promise<Array>}
 */
export async function getTodayPlans(targetJid) {
  const pool = getPool();
  const today = toDateOnly(new Date());

  const res = await pool.query(
    `SELECT id, plan_date, summary_hour, summary_minute, items, is_sent, created_at
     FROM daily_plans
     WHERE target_jid = $1 AND plan_date = $2
     ORDER BY created_at ASC`,
    [targetJid, today]
  );

  return res.rows;
}

/**
 * Menghapus planner berdasarkan id dan owner.
 * @param {string} targetJid
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export async function deleteDailyPlan(targetJid, id) {
  const pool = getPool();
  const res = await pool.query(
    `DELETE FROM daily_plans WHERE id = $1 AND target_jid = $2`,
    [id, targetJid]
  );
  return res.rowCount > 0;
}

/**
 * Memeriksa planner yang harus dikirim sekarang lalu kirim ringkasan pagi.
 * @param {object} sock
 * @returns {Promise<void>}
 */
export async function checkAndSendDailyPlans(sock) {
  const pool = getPool();
  const now = new Date();
  const today = toDateOnly(now);
  const hour = now.getHours();
  const minute = now.getMinutes();

  const res = await pool.query(
    `SELECT id, target_jid, plan_date, summary_hour, summary_minute, items
     FROM daily_plans
     WHERE plan_date = $1
       AND summary_hour = $2
       AND summary_minute = $3
       AND is_sent = false
     ORDER BY created_at ASC`,
    [today, hour, minute]
  );

  for (const row of res.rows) {
    try {
      const agendaLines = (row.items || []).map((item, index) => `${index + 1}. ${item}`);
      const text = `🌅 *Planner Pagi Mas Ichsan*\n\nBerikut agenda Mas Ichsan hari ini:\n\n${agendaLines.join('\n')}\n\nSemangat, semoga harinya lancar dan produktif.`;

      await sock.sendMessage(row.target_jid, { text });

      await pool.query(
        `UPDATE daily_plans SET is_sent = true WHERE id = $1`,
        [row.id]
      );
    } catch (error) {
      console.error(`Gagal mengirim daily plan id ${row.id}:`, error);
    }
  }
}