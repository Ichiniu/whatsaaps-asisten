import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { ASSISTANT_PERSONA } from './persona.js';
import { getMemories } from './memoryService.js';
import { buildKnowledgeContext } from './knowledgeBaseService.js';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;

let groq = null;
if (apiKey && apiKey !== 'your_groq_api_key_here') {
  groq = new Groq({ apiKey });
}

/**
 * Mengirimkan prompt ke Groq AI (llama-3.1-8b-instant) dan mengembalikan respons teks.
 * Mendukung riwayat percakapan (multi-turn) dan memori jangka panjang.
 * 
 * @param {string} prompt - Prompt terbaru dari pengguna
 * @param {Array<{role: string, content: string}>} history - Riwayat percakapan sebelumnya
 * @param {string|null} targetJid - JID WhatsApp pengguna untuk memuat memori
 * @returns {Promise<string>} - Jawaban dari AI
 */
export async function generateAIResponse(prompt, history = [], targetJid = null) {
  if (!groq) {
    const currentApiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;
    if (currentApiKey && currentApiKey !== 'your_groq_api_key_here') {
      groq = new Groq({ apiKey: currentApiKey });
    } else {
      throw new Error('GROQ_API_KEY belum dikonfigurasi di file .env');
    }
  }

  // 1. Dapatkan memori jangka panjang jika ada targetJid
  let memoryPrompt = '';
  let knowledgePrompt = '';
  if (targetJid) {
    const memories = await getMemories(targetJid);
    if (memories.length > 0) {
      const factList = memories.map(m => `- ${m.fact}`).join('\n');
      memoryPrompt = `\n\n[MEMORI JANGKA PANJANG TENTANG MAS ICHSAN]\nKamu mengingat fakta & preferensi tentang Mas Ichsan berikut dari obrolan sebelumnya. Gunakan informasi ini jika relevan untuk menjawab obrolan:\n${factList}`;
    }

    knowledgePrompt = await buildKnowledgeContext(targetJid, prompt, 3);
  }

  // Bangun array messages: system + history + pesan user terbaru
  const messages = [
    {
      role: 'system',
      content: ASSISTANT_PERSONA.systemInstruction + memoryPrompt + knowledgePrompt
    },
    ...history,
    {
      role: 'user',
      content: prompt
    }
  ];

  try {
    // Coba gunakan model yang lebih pintar (Llama 3.3 70B)
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens: 1024
    });

    return completion.choices[0]?.message?.content || 'Maaf, tidak ada respon dari AI.';
  } catch (error) {
    console.warn(`[Groq API] Gagal menggunakan llama-3.3-70b-versatile (${error.message}). Menggunakan fallback ke llama-3.1-8b-instant...`);
    
    try {
      // Fallback otomatis ke versi yang lebih ringan dengan limit sangat besar (14.4K RPD)
      const fallbackCompletion = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages,
        temperature: 0.7,
        max_tokens: 1024
      });
      
      return fallbackCompletion.choices[0]?.message?.content || 'Maaf, tidak ada respon dari AI.';
    } catch (fallbackError) {
      console.error('Error saat memanggil Groq API pada model fallback:', fallbackError);
      throw fallbackError;
    }
  }
}
