import { analyzeMessage } from './ai/brain.js';
import dotenv from 'dotenv';

dotenv.config();

console.log('=== TESTING ASSISTANT BRAIN (INTENT & ENTITY) ===\n');

const tests = [
  // 1. Rule lokal: manajemen pengingat
  { text: '!reminder list', isGroup: false, expectedSource: 'local_rule', expectedIntent: 'MANAGE_REMINDER' },
  { text: '!reminder hapus 3', isGroup: false, expectedSource: 'local_rule', expectedIntent: 'MANAGE_REMINDER' },
  
  // 2. Rule lokal: hapus chat
  { text: '!ai clear', isGroup: false, expectedSource: 'local_rule', expectedIntent: 'CLEAR_CHAT' },
  
  // 3. Rule lokal: chat manual dengan prefix
  { text: '!ai Siapa namamu?', isGroup: true, expectedSource: 'local_rule', expectedIntent: 'CHAT_AI' },
  
  // 4. Regex lokal: pemicu pengingat alami standar
  { text: 'ingatkan aku besok jam 12:00 rapat koordinasi', isGroup: false, expectedSource: 'local_regex', expectedIntent: 'CREATE_REMINDER' },
  { text: 'ingatkan setiap hari jam 07:00 sarapan', isGroup: false, expectedSource: 'local_regex', expectedIntent: 'CREATE_REMINDER' },

  // 5. Shortcut lokal: obrolan umum di DM pribadi (tanpa indikasi waktu/pengingat) -> langsung CHAT_AI (no LLM call!)
  { text: 'Siapa penemu lampu pijar?', isGroup: false, expectedSource: 'local_shortcut_chat', expectedIntent: 'CHAT_AI' },
  { text: 'Halo asisten, apa kabar?', isGroup: false, expectedSource: 'local_shortcut_chat', expectedIntent: 'CHAT_AI' },
  
  // 6. AI Fallback: Kalimat pengingat kasual/samar (mengandung kata 'jam' atau 'ingat') -> Panggil LLM Groq
  { text: 'tolong dicatat ya agenda rapat koordinasi lusa jam 10 pagi', isGroup: false, expectedSource: 'groq_ai', expectedIntent: 'CREATE_REMINDER' },
  { text: 'ingat ya nanti sore jam 5 jemput adik di sekolah', isGroup: false, expectedSource: 'groq_ai', expectedIntent: 'CREATE_REMINDER' },

  // 7. Typo Handling: Koreksi salah ketik secara diam-diam
  { text: '!remindr list', isGroup: false, expectedSource: 'local_rule', expectedIntent: 'MANAGE_REMINDER' },
  { text: '!ia clear', isGroup: false, expectedSource: 'local_rule', expectedIntent: 'CLEAR_CHAT' },
  { text: '!a1 Siapa penemu listrik?', isGroup: false, expectedSource: 'local_rule', expectedIntent: 'CHAT_AI' }
];

async function runTests() {
  let passedCount = 0;
  
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    console.log(`Test #${i + 1}: "${t.text}" (Group: ${t.isGroup})`);
    try {
      const start = Date.now();
      const result = await analyzeMessage(t.text, t.isGroup);
      const duration = Date.now() - start;
      
      console.log(`  -> Intent: ${result.intent}`);
      console.log(`  -> Source: ${result.source}`);
      console.log(`  -> Entities: ${JSON.stringify(result.entities)}`);
      console.log(`  -> Waktu Respon: ${duration}ms`);
      
      if (result.intent === t.expectedIntent && result.source === t.expectedSource) {
        console.log('  ✅ PASSED\n');
        passedCount++;
      } else {
        console.warn(`  ❌ FAILED (Expected Intent: ${t.expectedIntent}, Source: ${t.expectedSource})\n`);
      }
    } catch (error) {
      console.error(`  💥 ERROR: ${error.message}\n`);
    }
  }

  console.log(`=== HASIL PENGUJIAN ===`);
  console.log(`Lolos: ${passedCount} / ${tests.length}`);
}

runTests();
