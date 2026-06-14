import { initDatabase, getPool } from './database/db.js';
import { addReminder, getLastFiredReminder, updateLastFiredReminder, snoozeReminder } from './ai/reminderService.js';
import { getHistory, saveMessage } from './ai/conversationService.js';
import { analyzeMessage } from './ai/brain.js';
import dotenv from 'dotenv';

dotenv.config();

const JID = 'test_user_fase3@s.whatsapp.net';

async function runTests() {
  console.log('=== TESTING FASE 3 (SNOOZE & CONTEXT WINDOWING) ===\n');
  
  try {
    await initDatabase();
    const pool = getPool();

    // Bersihkan database tester agar bersih
    await pool.query('DELETE FROM reminders WHERE target_jid = $1', [JID]);
    await pool.query('DELETE FROM user_sessions WHERE target_jid = $1', [JID]);
    await pool.query('DELETE FROM conversations WHERE target_jid = $1', [JID]);

    console.log('--- 1. Testing Snooze Sesi & DB ---');
    // 1.1 Buat reminder uji coba sekali jalan
    const reminderTime = new Date(Date.now() - 5000); // 5 detik yang lalu (jatuh tempo)
    const reminder = await addReminder(JID, reminderTime, 'Minum kopi sore', null);
    console.log(`✅ Reminder uji coba dibuat: ID: ${reminder.id}, Agenda: "${reminder.message}"`);

    // 1.2 Update sesi last fired
    await updateLastFiredReminder(JID, reminder.id);
    console.log('✅ updateLastFiredReminder berhasil dipanggil.');

    // 1.3 Ambil kembali last fired
    const lastFired = await getLastFiredReminder(JID);
    if (lastFired && lastFired.id === reminder.id) {
      console.log('✅ getLastFiredReminder berhasil mengambil ID yang benar.');
    } else {
      throw new Error('❌ getLastFiredReminder gagal mengambil data yang benar!');
    }

    console.log('\n--- 2. Testing Snooze Intent Detection (brain.js) ---');
    const snoozeTests = [
      { input: 'tunda', expectedDuration: 10, expectedUnit: 'menit' },
      { input: 'tunda 25 menit', expectedDuration: 25, expectedUnit: 'menit' },
      { input: 'nanti 2 jam', expectedDuration: 2, expectedUnit: 'jam' },
      { input: 'snooze 15 m', expectedDuration: 15, expectedUnit: 'menit' }
    ];

    for (const st of snoozeTests) {
      const result = await analyzeMessage(st.input, false);
      if (result.intent === 'SNOOZE_REMINDER' && 
          result.entities.duration === st.expectedDuration && 
          result.entities.unit === st.expectedUnit) {
        console.log(`✅ Input "${st.input}" -> Snooze: ${result.entities.duration} ${result.entities.unit}`);
      } else {
        throw new Error(`❌ Input "${st.input}" GAGAL di-parse! Hasil: ${JSON.stringify(result)}`);
      }
    }

    console.log('\n--- 3. Testing Snooze Execution ---');
    const snoozeTime = new Date(Date.now() + 10 * 60 * 1000); // Tunda 10 menit
    await snoozeReminder(JID, lastFired, snoozeTime);
    
    // Periksa DB apakah reminder di-reset statusnya
    const checkRes = await pool.query('SELECT time, is_sent FROM reminders WHERE id = $1', [reminder.id]);
    const updatedReminder = checkRes.rows[0];
    if (updatedReminder && updatedReminder.is_sent === false) {
      console.log(`✅ Snooze sukses: Waktu target diubah ke ${updatedReminder.time} dan is_sent di-reset ke false.`);
    } else {
      throw new Error('❌ Snooze gagal memperbarui status DB reminders!');
    }

    console.log('\n--- 4. Testing Context Windowing (30 Menit) ---');
    
    // 4.1 Simpan pesan 40 menit yang lalu (harus kedaluwarsa / diabaikan)
    await saveMessage(JID, 'user', 'Pesan lama 40 menit lalu');
    const fortyMinsAgo = new Date(Date.now() - 40 * 60 * 1000);
    // Secara manual manipulasi created_at data lama agar teruji
    await pool.query('UPDATE conversations SET created_at = $1 WHERE content = $2', [fortyMinsAgo, 'Pesan lama 40 menit lalu']);
    
    // 4.2 Simpan pesan 10 menit yang lalu (harus tetap diambil)
    await saveMessage(JID, 'user', 'Pesan baru 10 menit lalu');
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    await pool.query('UPDATE conversations SET created_at = $1 WHERE content = $2', [tenMinsAgo, 'Pesan baru 10 menit lalu']);

    // 4.3 Ambil history
    const history = await getHistory(JID);
    console.log(`  -> Jumlah riwayat yang didapat: ${history.length}`);
    history.forEach(h => console.log(`  -> [${h.role}]: "${h.content}"`));

    const hasOldMessage = history.some(h => h.content === 'Pesan lama 40 menit lalu');
    const hasNewMessage = history.some(h => h.content === 'Pesan baru 10 menit lalu');

    if (!hasOldMessage && hasNewMessage) {
      console.log('✅ Context Windowing sukses! Pesan > 30 menit diabaikan, pesan baru tetap masuk.');
    } else {
      throw new Error('❌ Context Windowing gagal memfilter data berdasarkan rentang waktu 30 menit!');
    }

    console.log('\n🎉 ALL FASE 3 TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
  } finally {
    process.exit(0);
  }
}

runTests();
