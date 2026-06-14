import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { getPool } from '../database/db.js';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;
let groq = null;
if (apiKey && apiKey !== 'your_groq_api_key_here') {
  groq = new Groq({ apiKey });
}

const MAX_MEMORIES = 20; // Batas fakta terpenting yang disimpan per user

/**
 * Menyimpan fakta baru ke memori jangka panjang di database.
 * @param {string} targetJid 
 * @param {string} fact 
 * @returns {Promise<boolean>} - true jika berhasil disimpan
 */
export async function saveMemory(targetJid, fact) {
  const pool = getPool();
  const cleanFact = fact.trim();
  
  if (!cleanFact) return false;

  try {
    // 1. Cek apakah fakta serupa sudah pernah disimpan untuk menghindari duplikasi
    const dupRes = await pool.query(
      `SELECT id FROM user_memories 
       WHERE target_jid = $1 
         AND LOWER(fact) = LOWER($2)`,
      [targetJid, cleanFact]
    );

    if (dupRes.rowCount > 0) {
      return false; // Duplikat, skip
    }

    // 2. Simpan fakta baru
    await pool.query(
      `INSERT INTO user_memories (target_jid, fact) VALUES ($1, $2)`,
      [targetJid, cleanFact]
    );

    // 3. Batasi memori maksimal (jika melebihi MAX_MEMORIES, hapus yang paling lama)
    const countRes = await pool.query(
      `SELECT count(*) FROM user_memories WHERE target_jid = $1`,
      [targetJid]
    );
    const count = parseInt(countRes.rows[0].count, 10);

    if (count > MAX_MEMORIES) {
      const overLimit = count - MAX_MEMORIES;
      await pool.query(
        `DELETE FROM user_memories 
         WHERE id IN (
           SELECT id FROM user_memories 
           WHERE target_jid = $1 
           ORDER BY created_at ASC 
           LIMIT $2
         )`,
        [targetJid, overLimit]
      );
      console.log(`[Memory System] Menghapus ${overLimit} memori tertua karena melebihi batas.`);
    }

    return true;
  } catch (err) {
    console.error('Error saving memory to DB:', err);
    return false;
  }
}

/**
 * Mengambil semua fakta memori jangka panjang untuk satu JID.
 * @param {string} targetJid 
 * @returns {Promise<Array<{id: number, fact: string}>>}
 */
export async function getMemories(targetJid) {
  const pool = getPool();
  try {
    const res = await pool.query(
      `SELECT id, fact 
       FROM user_memories 
       WHERE target_jid = $1 
       ORDER BY created_at DESC`,
      [targetJid]
    );
    return res.rows;
  } catch (err) {
    console.error('Error getting memories from DB:', err);
    return [];
  }
}

/**
 * Menghapus memori jangka panjang berdasarkan JID dan indeks urutan atau ID.
 * @param {string} targetJid 
 * @param {number} memoryId 
 * @returns {Promise<boolean>}
 */
export async function deleteMemory(targetJid, memoryId) {
  const pool = getPool();
  try {
    const res = await pool.query(
      `DELETE FROM user_memories WHERE id = $1 AND target_jid = $2`,
      [memoryId, targetJid]
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('Error deleting memory from DB:', err);
    return false;
  }
}

/**
 * Menganalisis percakapan secara asinkron menggunakan LLM Groq
 * untuk mengekstrak fakta pribadi penting tentang user dan menyimpannya.
 * 
 * @param {string} targetJid 
 * @param {string} userMessage 
 * @param {string} assistantResponse 
 */
export async function extractAndSaveMemories(targetJid, userMessage, assistantResponse) {
  // Hanya jalankan jika Groq terkonfigurasi
  if (!groq) {
    const currentApiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;
    if (currentApiKey && currentApiKey !== 'your_groq_api_key_here') {
      groq = new Groq({ apiKey: currentApiKey });
    } else {
      return;
    }
  }

  // Hindari memproses perintah administratif
  if (userMessage.startsWith('!')) return;

  const systemPrompt = `Anda adalah modul "Memory Extractor" untuk asisten pribadi Mas Ichsan.
Tugas Anda adalah menganalisis obrolan terbaru antara Mas Ichsan (User) dan Asisten, lalu menentukan apakah ada informasi penting tentang preferensi, fakta pribadi, atau pekerjaan Mas Ichsan yang patut diingat untuk jangka panjang.

Kategori Informasi untuk Diingat:
1. Preferensi atau kesukaan (misal: "Mas Ichsan suka minum kopi hitam tanpa gula").
2. Fakta pribadi penting (misal: hobi, kebiasaan, alergi, nama rekan kerja, keluarga).
3. Pekerjaan atau proyek aktif (misal: "Mas Ichsan sedang mengerjakan proyek wbot", "Mas Ichsan besok ada rapat dengan tim IT").

Aturan Ekstraksi:
- Tuliskan fakta dalam bentuk kalimat singkat pihak ketiga yang objektif (misal: "Mas Ichsan suka makanan pedas").
- JANGAN mengekstrak informasi yang sifatnya sementara atau emosional sesaat (seperti "Mas Ichsan sedang merasa mengantuk hari ini" atau "Mas Ichsan sedang kesal").
- JANGAN mengulang fakta yang sama yang sudah ada secara logika.
- Jika tidak ada informasi penting yang patut diingat, kembalikan array kosong.

Kembalikan HANYA objek JSON valid dengan format:
{
  "new_facts": ["fakta 1", "fakta 2"]
}
Jangan sertakan penjelasan atau teks tambahan apa pun di luar JSON.`;

  const chatSegment = `User (Mas Ichsan): "${userMessage}"\nAssistant: "${assistantResponse}"`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: chatSegment }
      ],
      temperature: 0.1,
      max_tokens: 250,
      response_format: { type: 'json_object' }
    });

    const resText = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(resText);
    const newFacts = parsed.new_facts || [];

    for (const fact of newFacts) {
      const saved = await saveMemory(targetJid, fact);
      if (saved) {
        console.log(`[Memory System] Memori baru disimpan untuk ${targetJid}: "${fact}"`);
      }
    }
  } catch (err) {
    console.error('Error extracting memories via Groq:', err);
  }
}
