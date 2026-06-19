import { getPool } from '../database/db.js';

const MAX_KB_ITEMS = 50;

/**
 * Membersihkan dan membatasi panjang tag.
 * @param {string[]|null|undefined} tags
 * @returns {string[]}
 */
function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];

  const normalized = tags
    .map(tag => String(tag || '').trim().toLowerCase())
    .filter(Boolean)
    .map(tag => tag.replace(/\s+/g, '-'))
    .filter(tag => tag.length <= 40);

  return [...new Set(normalized)];
}

/**
 * Mengambil kata kunci sederhana dari query untuk pencarian lokal.
 * @param {string} query
 * @returns {string[]}
 */
function extractKeywords(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map(word => word.trim())
    .filter(word => word.length >= 3);
}

/**
 * Menambahkan item knowledge base baru.
 * @param {string} targetJid
 * @param {string} title
 * @param {string} content
 * @param {string[]} tags
 * @returns {Promise<object|null>}
 */
export async function addKnowledge(targetJid, title, content, tags = []) {
  const pool = getPool();
  const cleanTitle = String(title || '').trim();
  const cleanContent = String(content || '').trim();
  const cleanTags = normalizeTags(tags);

  if (!targetJid || !cleanTitle || !cleanContent) {
    return null;
  }

  try {
    const insertRes = await pool.query(
      `INSERT INTO knowledge_base (target_jid, title, content, tags)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, content, tags, created_at, updated_at`,
      [targetJid, cleanTitle, cleanContent, cleanTags]
    );

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM knowledge_base WHERE target_jid = $1`,
      [targetJid]
    );
    const count = parseInt(countRes.rows[0].count, 10);

    if (count > MAX_KB_ITEMS) {
      const overLimit = count - MAX_KB_ITEMS;
      await pool.query(
        `DELETE FROM knowledge_base
         WHERE id IN (
           SELECT id
           FROM knowledge_base
           WHERE target_jid = $1
           ORDER BY updated_at ASC, created_at ASC
           LIMIT $2
         )`,
        [targetJid, overLimit]
      );
    }

    return insertRes.rows[0] || null;
  } catch (err) {
    console.error('Error adding knowledge base item:', err);
    return null;
  }
}

/**
 * Mengambil daftar knowledge base milik user.
 * @param {string} targetJid
 * @returns {Promise<Array>}
 */
export async function listKnowledge(targetJid) {
  const pool = getPool();
  try {
    const res = await pool.query(
      `SELECT id, title, content, tags, created_at, updated_at
       FROM knowledge_base
       WHERE target_jid = $1
       ORDER BY updated_at DESC, created_at DESC`,
      [targetJid]
    );
    return res.rows;
  } catch (err) {
    console.error('Error listing knowledge base items:', err);
    return [];
  }
}

/**
 * Menghapus item knowledge base berdasarkan ID.
 * @param {string} targetJid
 * @param {number} knowledgeId
 * @returns {Promise<boolean>}
 */
export async function deleteKnowledge(targetJid, knowledgeId) {
  const pool = getPool();
  try {
    const res = await pool.query(
      `DELETE FROM knowledge_base
       WHERE id = $1 AND target_jid = $2`,
      [knowledgeId, targetJid]
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('Error deleting knowledge base item:', err);
    return false;
  }
}

/**
 * Mencari item knowledge base yang relevan untuk query.
 * @param {string} targetJid
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function searchKnowledge(targetJid, query, limit = 5) {
  const pool = getPool();
  const cleanQuery = String(query || '').trim();
  const keywords = extractKeywords(cleanQuery);

  if (!targetJid || !cleanQuery) {
    return [];
  }

  try {
    const res = await pool.query(
      `SELECT id, title, content, tags, created_at, updated_at
       FROM knowledge_base
       WHERE target_jid = $1
         AND (
           title ILIKE $2
           OR content ILIKE $2
           OR EXISTS (
             SELECT 1
             FROM unnest(tags) AS tag
             WHERE tag ILIKE $2
           )
         )
       ORDER BY updated_at DESC, created_at DESC
       LIMIT $3`,
      [targetJid, `%${cleanQuery}%`, limit]
    );

    if (res.rows.length > 0) {
      return res.rows;
    }

    if (keywords.length === 0) {
      return [];
    }

    const fallbackMatches = [];
    const allItems = await listKnowledge(targetJid);

    for (const item of allItems) {
      const haystack = `${item.title} ${item.content} ${(item.tags || []).join(' ')}`.toLowerCase();
      const score = keywords.reduce((acc, keyword) => acc + (haystack.includes(keyword) ? 1 : 0), 0);

      if (score > 0) {
        fallbackMatches.push({ ...item, _score: score });
      }
    }

    return fallbackMatches
      .sort((a, b) => b._score - a._score || new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, limit)
      .map(({ _score, ...item }) => item);
  } catch (err) {
    console.error('Error searching knowledge base items:', err);
    return [];
  }
}

/**
 * Membuat string konteks knowledge base untuk disisipkan ke prompt AI.
 * @param {string} targetJid
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<string>}
 */
export async function buildKnowledgeContext(targetJid, query, limit = 3) {
  const matches = await searchKnowledge(targetJid, query, limit);

  if (matches.length === 0) {
    return '';
  }

  const lines = matches.map((item, index) => {
    const tags = Array.isArray(item.tags) && item.tags.length > 0
      ? ` [tags: ${item.tags.join(', ')}]`
      : '';
    return `${index + 1}. ${item.title}${tags}\n${item.content}`;
  });

  return `\n\n[KNOWLEDGE BASE PRIBADI]\nGunakan referensi berikut jika relevan dan jangan mengada-ada di luar data ini:\n${lines.join('\n\n')}`;
}