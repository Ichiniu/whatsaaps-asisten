import { initDatabase, getPool } from './database/db.js';
import { saveMemory, getMemories, deleteMemory, extractAndSaveMemories } from './ai/memoryService.js';
import { analyzeMessage } from './ai/brain.js';
import dotenv from 'dotenv';

dotenv.config();

const JID = 'test_memory@s.whatsapp.net';

async function runTests() {
  console.log('=== TESTING LONG-TERM MEMORY SYSTEM ===\n');

  try {
    await initDatabase();
    const pool = getPool();

    // Bersihkan data tester
    await pool.query('DELETE FROM user_memories WHERE target_jid = $1', [JID]);

    console.log('--- 1. Testing CRUD Memori Manual ---');
    // 1.1 Simpan memori manual
    const saved1 = await saveMemory(JID, 'Mas Ichsan suka kopi susu tanpa gula');
    const saved2 = await saveMemory(JID, 'Mas Ichsan suka warna biru');
    
    if (saved1 && saved2) {
      console.log('✅ Berhasil menyimpan memori manual.');
    } else {
      throw new Error('❌ Gagal menyimpan memori manual!');
    }

    // Coba simpan duplikat (harus dilewati)
    const savedDup = await saveMemory(JID, 'Mas Ichsan suka kopi susu tanpa gula');
    if (!savedDup) {
      console.log('✅ Duplikasi memori berhasil dihindari.');
    } else {
      throw new Error('❌ Sistem menyimpan memori duplikat!');
    }

    // 1.2 Ambil memori
    let memories = await getMemories(JID);
    console.log(`✅ getMemories mengembalikan ${memories.length} memori.`);
    memories.forEach(m => console.log(`  -> ID: ${m.id}, Fakta: "${m.fact}"`));
    
    if (memories.length !== 2) {
      throw new Error('❌ Jumlah memori tidak sesuai!');
    }

    console.log('\n--- 2. Testing Memory Intent Detection (brain.js) ---');
    const intentTests = [
      { input: '!ai memory', expectedAction: 'list', expectedTargetId: null },
      { input: '!ai forget 1', expectedAction: 'forget', expectedTargetId: 1 },
      { input: '!ai lupakan 2', expectedAction: 'forget', expectedTargetId: 2 }
    ];

    for (const it of intentTests) {
      const result = await analyzeMessage(it.input, false);
      if (result.intent === 'MANAGE_MEMORY' && 
          result.entities.action === it.expectedAction && 
          result.entities.targetId === it.expectedTargetId) {
        console.log(`✅ Input "${it.input}" -> Intent: ${result.intent}, Action: ${result.entities.action}, Target: ${result.entities.targetId}`);
      } else {
        throw new Error(`❌ Input "${it.input}" GAGAL di-parse! Hasil: ${JSON.stringify(result)}`);
      }
    }

    console.log('\n--- 3. Testing LLM Memory Extraction (extractAndSaveMemories) ---');
    const userMsg = 'Oiya, saat ini aku sedang mengembangkan aplikasi asisten pribadi bernama wbot menggunakan Node.js.';
    const botMsg = 'Wah keren sekali Mas Ichsan! Semoga pembuatan aplikasi wbot dengan Node.js berjalan lancar ya.';
    
    console.log('Memanggil LLM Groq untuk mengekstrak memori baru secara otomatis...');
    const start = Date.now();
    await extractAndSaveMemories(JID, userMsg, botMsg);
    console.log(`Proses selesai dalam ${Date.now() - start}ms.`);

    // Ambil lagi daftar memori dari DB
    memories = await getMemories(JID);
    console.log(`\nFakta yang diingat asisten sekarang (Total: ${memories.length}):`);
    memories.forEach((m, idx) => console.log(`  ${idx + 1}. [ID: ${m.id}] "${m.fact}"`));

    const hasExtractedFact = memories.some(m => m.fact.toLowerCase().includes('wbot') || m.fact.toLowerCase().includes('node.js'));
    if (hasExtractedFact) {
      console.log('✅ Ekstraksi memori otomatis oleh LLM sukses!');
    } else {
      throw new Error('❌ LLM gagal mengekstrak fakta penting dari percakapan!');
    }

    console.log('\n--- 4. Testing Delete Memory ---');
    const targetMemory = memories[0];
    const deleted = await deleteMemory(JID, targetMemory.id);
    if (deleted) {
      console.log(`✅ Berhasil melupakan memori ID ${targetMemory.id}: "${targetMemory.fact}"`);
      const finalMemories = await getMemories(JID);
      if (finalMemories.length === memories.length - 1) {
        console.log('✅ Jumlah memori setelah dihapus berkurang dengan benar.');
      } else {
        throw new Error('❌ Jumlah memori di DB tidak berkurang!');
      }
    } else {
      throw new Error('❌ Gagal menghapus memori!');
    }

    console.log('\n🎉 ALL LONG-TERM MEMORY TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
  } finally {
    try {
      const pool = getPool();
      await pool.end();
      console.log('Database pool closed.');
    } catch (e) {
      // Abaikan jika pool belum dibuat
    }
    process.exit(0);
  }
}

runTests();
