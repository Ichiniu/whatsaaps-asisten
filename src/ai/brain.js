import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { parseReminderText } from './reminderService.js';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;
let groq = null;
if (apiKey && apiKey !== 'your_groq_api_key_here') {
  groq = new Groq({ apiKey });
}

/**
 * Mengevaluasi pesan masuk secara cepat dengan aturan lokal (Regex / Rule-based).
 * Menghindari pemanggilan API LLM untuk perintah yang berpola pasti atau chat umum yang tidak relevan.
 * 
 * @param {string} text - Teks pesan masuk
 * @param {boolean} isGroup - Apakah pesan berasal dari grup
 * @returns {object|null} - Hasil analisis terstruktur jika cocok dengan rule lokal, null jika tidak cocok
 */
function analyzeMessageLocally(text, isGroup) {
  const cleanText = text.trim();
  const lowerText = cleanText.toLowerCase();

  // 0. Deteksi perintah tunda (snooze) cepat
  const snoozeRegex = /^(tunda|nanti|snooze|entaran|tunda dulu)(?:\s+(\d+)\s*(menit|jam|m|h)?)?$/i;
  const snoozeMatch = cleanText.match(snoozeRegex);
  if (snoozeMatch) {
    const rawVal = snoozeMatch[2];
    const rawUnit = snoozeMatch[3] ? snoozeMatch[3].toLowerCase() : 'menit';
    
    let duration = rawVal ? parseInt(rawVal, 10) : 10;
    let unit = 'menit';
    
    if (rawUnit === 'jam' || rawUnit === 'h') {
      unit = 'jam';
    }

    return {
      intent: 'SNOOZE_REMINDER',
      entities: { duration, unit },
      source: 'local_rule'
    };
  }

  // 1. Deteksi perintah manajemen pengingat (!reminder ...)
  if (lowerText.startsWith('!reminder')) {
    const parts = cleanText.split(/\s+/);
    const subCommand = parts[1] ? parts[1].toLowerCase() : 'help';
    let action = 'help';
    let targetId = null;

    if (['list', 'daftar'].includes(subCommand)) {
      action = 'list';
    } else if (['hapus', 'delete'].includes(subCommand)) {
      action = 'delete';
      targetId = parts[2] ? parseInt(parts[2], 10) : null;
    } else if (['stop', 'nonaktifkan'].includes(subCommand)) {
      action = 'stop';
      targetId = parts[2] ? parseInt(parts[2], 10) : null;
    }

    return {
      intent: 'MANAGE_REMINDER',
      entities: { action, targetId },
      source: 'local_rule'
    };
  }

  // 2. Deteksi pembersihan chat AI (!ai clear)
  if (lowerText === '!ai clear') {
    return {
      intent: 'CLEAR_CHAT',
      entities: {},
      source: 'local_rule'
    };
  }

  // 2b. Deteksi perintah ingatan AI (!ai memory / !ai forget)
  if (lowerText === '!ai memory' || lowerText === '!ai memories' || lowerText === '!ai ingatan') {
    return {
      intent: 'MANAGE_MEMORY',
      entities: { action: 'list', targetId: null },
      source: 'local_rule'
    };
  }

  if (lowerText.startsWith('!ai forget') || lowerText.startsWith('!ai lupakan')) {
    const parts = cleanText.split(/\s+/);
    const targetId = parts[2] ? parseInt(parts[2], 10) : null;
    return {
      intent: 'MANAGE_MEMORY',
      entities: { action: 'forget', targetId },
      source: 'local_rule'
    };
  }

  // 3. Deteksi chat AI manual dengan prefix (!ai ...) di grup atau DM
  if (cleanText.startsWith('!ai ')) {
    const prompt = cleanText.slice(4).trim();
    return {
      intent: 'CHAT_AI',
      entities: { prompt },
      source: 'local_rule'
    };
  }

  // 4. Deteksi trigger pengingat alami berbasis kata kunci kaku
  const reminderTriggerRegex = /^(ingatkan aku|ingatkan|remind me|aku ada jadwal)\s+/i;
  if (reminderTriggerRegex.test(cleanText)) {
    const rawContent = cleanText.replace(reminderTriggerRegex, '').trim();
    const parsed = parseReminderText(rawContent);
    if (parsed) {
      return {
        intent: 'CREATE_REMINDER',
        entities: {
          task: parsed.cleanTask,
          datetime: parsed.targetTime ? parsed.targetTime.toISOString() : null,
          cron: parsed.cron || null,
          recurrence: parsed.cron ? (parsed.cron.split(' ')[4] === '*' ? 'daily' : 'weekly') : null
        },
        source: 'local_regex'
      };
    }
  }

  // 5. Perintah Bantuan Umum
  if (['!help', '/help', 'bantuan', 'menu bot', 'help bot'].includes(lowerText)) {
    return {
      intent: 'HELP',
      entities: {},
      source: 'local_rule'
    };
  }

  // 5b. Perintah Status Server
  if (lowerText === '!status' || lowerText === '!server' || lowerText === '!ping') {
    return {
      intent: 'SERVER_STATUS',
      entities: {},
      source: 'local_rule'
    };
  }

  // Jika di grup dan tidak ada prefix !ai / !reminder, abaikan pesan
  if (isGroup) {
    return {
      intent: 'IGNORE',
      entities: {},
      source: 'local_rule'
    };
  }

  return null;
}

/**
 * Mendeteksi apakah pesan memiliki indikasi waktu atau kata pengingat.
 * Digunakan untuk menyaring pesan mana yang layak dikirim ke LLM Intent Detector.
 * 
 * @param {string} text 
 * @returns {boolean}
 */
function hasTimeOrReminderIndications(text) {
  const lowerText = text.toLowerCase();
  
  // Gunakan regex dengan word boundaries agar tidak mencocokkan substring (seperti 'am' di 'lampu')
  const keywordsRegex = /\b(ingat|ingatkan|remind|jadwal|alarm|catat|agenda|tugas|warning|notif)\b/i;
  const timeIndicatorsRegex = /\b(jam|pukul|menit|detik|besok|nanti|lusa|hari|tanggal|bulan|tahun|wib|am|pm)\b/i;

  const hasKeyword = keywordsRegex.test(lowerText);
  const hasTime = timeIndicatorsRegex.test(lowerText);

  return hasKeyword || hasTime;
}

/**
 * Menganalisis pesan masuk menggunakan LLM Groq (Llama-3.1-8b-instant) sebagai fallback.
 * 
 * @param {string} text - Teks pesan masuk
 * @returns {Promise<object>} - Hasil analisis terstruktur (JSON) dari LLM
 */
async function analyzeMessageWithAI(text) {
  if (!groq) {
    const currentApiKey = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.trim() : null;
    if (currentApiKey && currentApiKey !== 'your_groq_api_key_here') {
      groq = new Groq({ apiKey: currentApiKey });
    } else {
      throw new Error('GROQ_API_KEY belum dikonfigurasi di file .env');
    }
  }

  const now = new Date();
  // Format waktu lokal untuk prompt
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' };
  const formattedNow = now.toLocaleString('id-ID', options);

  const systemPrompt = `Anda adalah modul "Assistant Brain" untuk mendeteksi Intent (maksud) dan Entity (entitas) dari pesan WhatsApp yang dikirim ke asisten pribadi Mas Ichsan.
Waktu lokal sekarang adalah: ${formattedNow} (WIB/Asia/Jakarta).

Analisis pesan pengguna dan kembalikan HANYA objek JSON valid dengan format berikut:
{
  "intent": "CREATE_REMINDER" | "CHAT_AI" | "CLEAR_CHAT" | "HELP",
  "entities": {
    "task": string | null,         // Isi agenda atau kegiatan pengingat (bersihkan kata pengantar/waktu seperti "ingatkan", "besok jam 8")
    "datetime": string | null,     // Waktu target pelaksanaan dalam format ISO 8601 (YYYY-MM-DDTHH:mm:ss). Jika berulang (cron), buat null.
    "recurrence": string | null,   // "daily" (jika harian) atau "weekly" (jika mingguan)
    "cron": string | null,         // Ekspresi cron standar (5 kolom: menit jam tgl bln hari) jika pengingat berulang. Contoh setiap hari jam 07:00: "0 7 * * *", setiap senin jam 09:00: "0 9 * * 1".
    "action": string | null,       // "list" | "delete" | "stop" | "help" (jika terkait manajemen pengingat)
    "targetId": number | null      // ID pengingat jika ingin menghapus atau menghentikan pengingat tertentu
  }
}

Aturan Penentuan Intent:
1. Jika pengguna ingin membuat alarm/pengingat/jadwal/tugas baru (misal: "tolong ingetin besok jam 8 pagi beli roti", "nanti sore jam 5 ingetin jemput adik", "tiap jam 7 pagi ingatkan minum obat"), kembalikan intent "CREATE_REMINDER". Pastikan "entities.task" berisi kegiatannya, dan "entities.datetime" berisi waktu target yang dihitung dari waktu sekarang, atau "entities.cron" jika berulang.
2. Jika pengguna meminta bantuan atau menu instruksi bot, kembalikan intent "HELP".
3. Jika pengguna ingin menghapus riwayat chat (misal: "clear chat", "hapus memori"), kembalikan intent "CLEAR_CHAT".
4. Selain itu, jika hanya mengobrol santai, bertanya informasi, menyapa, kembalikan intent "CHAT_AI".

Kembalikan HANYA JSON yang valid. Jangan berikan penjelasan atau teks tambahan di luar JSON.`;

  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      temperature: 0.1, // Suhu rendah agar output JSON lebih konsisten dan deterministik
      max_tokens: 300,
      response_format: { type: 'json_object' } // Paksa respon dalam format JSON
    });

    const resultText = completion.choices[0]?.message?.content || '{}';
    const parsedResult = JSON.parse(resultText);
    return {
      intent: parsedResult.intent || 'CHAT_AI',
      entities: parsedResult.entities || {},
      source: 'groq_ai'
    };
  } catch (error) {
    console.error('Error in analyzeMessageWithAI:', error);
    // Jika AI error, fallback ke CHAT_AI agar bot tetap merespons
    return {
      intent: 'CHAT_AI',
      entities: {},
      source: 'groq_ai_error'
    };
  }
}

/**
 * Menghitung jarak Levenshtein antara dua string untuk mendeteksi kemiripan teks.
 * 
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
function getLevenshteinDistance(a, b) {
  const tmp = [];
  let i, j;
  for (i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

/**
 * Mendeteksi dan mengoreksi salah ketik perintah yang diawali '!'.
 * 
 * @param {string} text 
 * @returns {string} - Teks hasil koreksi
 */
function correctTypo(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!')) return text;

  const words = trimmed.split(/\s+/);
  const firstWord = words[0].toLowerCase();

  // 1. Cek kecocokan dengan !reminder (jarak edit <= 2)
  const distReminder = getLevenshteinDistance(firstWord, '!reminder');
  if (distReminder <= 2 && distReminder > 0) {
    console.log(`[Assistant Brain] Mengoreksi typo perintah: "${firstWord}" -> "!reminder" (silent)`);
    words[0] = '!reminder';
    return words.join(' ');
  }

  // 2. Cek kecocokan dengan !ai (jarak edit <= 1 ATAU permutasi/anagram dari !ai seperti !ia)
  const distAi = getLevenshteinDistance(firstWord, '!ai');
  const withoutExcl = firstWord.slice(1);
  const isAnagramAi = withoutExcl.length === 2 && 
                      withoutExcl.includes('a') && 
                      withoutExcl.includes('i');

  const hasTypo = distAi > 0;
  if (hasTypo && (distAi <= 1 || isAnagramAi)) {
    console.log(`[Assistant Brain] Mengoreksi typo perintah: "${firstWord}" -> "!ai" (silent)`);
    words[0] = '!ai';
    return words.join(' ');
  }

  return text;
}

/**
 * Entry point utama analisis pesan (Assistant Brain).
 * 
 * @param {string} text - Teks pesan masuk
 * @param {boolean} isGroup - Apakah pesan dari grup
 * @returns {Promise<object>} - Hasil analisis terstruktur
 */
export async function analyzeMessage(text, isGroup) {
  if (!text) {
    return { intent: 'IGNORE', entities: {}, source: 'empty_text' };
  }

  // Koreksi typo jika diawali '!'
  const correctedText = correctTypo(text);

  // 1. Coba analisis menggunakan aturan lokal (Regex / Rules)
  const localAnalysis = analyzeMessageLocally(correctedText, isGroup);
  if (localAnalysis) {
    return localAnalysis;
  }

  // Jika berada di grup dan tidak lolos aturan lokal, abaikan
  if (isGroup) {
    return { intent: 'IGNORE', entities: {}, source: 'group_no_prefix' };
  }

  // 2. Di DM pribadi: Cek apakah ada indikasi waktu atau kata pengingat
  const maybeReminder = hasTimeOrReminderIndications(correctedText);
  if (maybeReminder) {
    console.log(`[Assistant Brain] Pesan memiliki indikasi pengingat. Memanggil AI untuk analisis intent.`);
    return await analyzeMessageWithAI(correctedText);
  }

  // 3. Jika tidak ada indikasi pengingat sama sekali di DM pribadi, langsung rutekan ke CHAT_AI
  return {
    intent: 'CHAT_AI',
    entities: { prompt: correctedText.trim() },
    source: 'local_shortcut_chat'
  };
}
