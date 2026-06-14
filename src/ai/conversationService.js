import { getPool } from '../database/db.js';

const MAX_HISTORY = 10; // Jumlah pesan terakhir yang dikirim sebagai context ke Groq

/**
 * Menyimpan satu pesan ke riwayat percakapan di PostgreSQL.
 * @param {string} targetJid - WhatsApp JID pengirim/penerima
 * @param {'user'|'assistant'} role - Peran pesan (user atau assistant)
 * @param {string} content - Isi pesan
 */
export async function saveMessage(targetJid, role, content) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO conversations (target_jid, role, content) VALUES ($1, $2, $3)`,
    [targetJid, role, content]
  );
}

/**
 * Mengambil N pesan terakhir dari riwayat percakapan untuk dijadikan context AI.
 * @param {string} targetJid
 * @param {number} limit - Jumlah pesan maksimal (default: MAX_HISTORY)
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
export async function getHistory(targetJid, limit = MAX_HISTORY) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT role, content
     FROM (
       SELECT role, content, created_at
       FROM conversations
       WHERE target_jid = $1
         AND created_at >= NOW() - INTERVAL '30 minutes'
       ORDER BY created_at DESC
       LIMIT $2
     ) sub
     ORDER BY created_at ASC`,
    [targetJid, limit]
  );
  return res.rows; // [{role: 'user', content: '...'}, {role: 'assistant', content: '...'}]
}

/**
 * Menghapus seluruh riwayat percakapan milik satu JID.
 * @param {string} targetJid
 * @returns {Promise<number>} Jumlah baris yang dihapus
 */
export async function clearHistory(targetJid) {
  const pool = getPool();
  const res = await pool.query(
    `DELETE FROM conversations WHERE target_jid = $1`,
    [targetJid]
  );
  return res.rowCount;
}
