import { initDatabase, getPool } from './database/db.js';
import { addReminder, getReminderByMsgId, updateReminderByMsgId } from './ai/reminderService.js';
import { analyzeMessage } from './ai/brain.js';
import { handleMessageEdit } from './bot/messageHandler.js';
import { addKnowledge, listKnowledge, deleteKnowledge, searchKnowledge } from './ai/knowledgeBaseService.js';
import dotenv from 'dotenv';

dotenv.config();

const JID = 'test_user_fase4@s.whatsapp.net';
const WA_MSG_ID = 'test_wa_msg_id_123456';

// Mock Baileys Socket untuk simulasi sendMessage
const mockSock = {
  sendMessage: async (jid, content, options) => {
    console.log(`  [Mock WA Send] Ke: ${jid}`);
    console.log(`  [Mock WA Send] Isi: \n${content.text}`);
    return { key: { id: 'mock_reply_id' } };
  }
};

async function runTests() {
  console.log('=== TESTING FASE 4 (EDIT HANDLER & STATUS) ===\n');

  try {
    await initDatabase();
    const pool = getPool();

    // Bersihkan database tester
    await pool.query('DELETE FROM reminders WHERE target_jid = $1', [JID]);
    await pool.query('DELETE FROM knowledge_base WHERE target_jid = $1', [JID]);

    console.log('--- 1. Testing DB whatsapp_msg_id & CRUD ---');
    // 1.1 Simpan pengingat dengan whatsappMsgId
    const targetTime = new Date(Date.now() + 10 * 60 * 1000); // 10 menit lagi
    const reminder = await addReminder(JID, targetTime, 'Rapat koordinasi', null, WA_MSG_ID);
    console.log(`✅ Reminder disimpan dengan ID WA: ${reminder.whatsappMsgId}`);

    // 1.2 Ambil berdasarkan Msg ID
    const fetched = await getReminderByMsgId(JID, WA_MSG_ID);
    if (fetched && fetched.whatsapp_msg_id === WA_MSG_ID && fetched.message === 'Rapat koordinasi') {
      console.log('✅ getReminderByMsgId mengembalikan data yang benar.');
    } else {
      throw new Error('❌ getReminderByMsgId gagal mengambil data!');
    }

    // 1.3 Update berdasarkan Msg ID
    const newTargetTime = new Date(Date.now() + 20 * 60 * 1000); // 20 menit lagi
    await updateReminderByMsgId(WA_MSG_ID, newTargetTime, 'Rapat koordinasi update', null);
    
    const fetchedUpdated = await getReminderByMsgId(JID, WA_MSG_ID);
    if (fetchedUpdated && fetchedUpdated.message === 'Rapat koordinasi update') {
      console.log('✅ updateReminderByMsgId berhasil memperbarui data di DB.');
    } else {
      throw new Error('❌ updateReminderByMsgId gagal memperbarui data!');
    }

    console.log('\n--- 2. Testing Intent Status (!status) ---');
    const statusResult = await analyzeMessage('!status', false);
    if (statusResult.intent === 'SERVER_STATUS') {
      console.log('✅ Perintah "!status" sukses di-parse menjadi SERVER_STATUS.');
    } else {
      throw new Error(`❌ Perintah "!status" gagal di-parse! Hasil: ${JSON.stringify(statusResult)}`);
    }

    console.log('\n--- 3. Testing Knowledge Base ---');
    const kbIntentHelp = await analyzeMessage('!kb help', false);
    if (kbIntentHelp.intent === 'MANAGE_KNOWLEDGE' && kbIntentHelp.entities.action === 'help') {
      console.log('✅ Perintah "!kb help" sukses di-parse menjadi MANAGE_KNOWLEDGE.');
    } else {
      throw new Error(`❌ Perintah "!kb help" gagal di-parse! Hasil: ${JSON.stringify(kbIntentHelp)}`);
    }

    const kbIntentAdd = await analyzeMessage('!kb tambah Server Fly | Local development pakai fly env | devops,server', false);
    if (
      kbIntentAdd.intent === 'MANAGE_KNOWLEDGE' &&
      kbIntentAdd.entities.action === 'add' &&
      kbIntentAdd.entities.title === 'Server Fly'
    ) {
      console.log('✅ Perintah "!kb tambah ..." sukses di-parse.');
    } else {
      throw new Error(`❌ Perintah "!kb tambah" gagal di-parse! Hasil: ${JSON.stringify(kbIntentAdd)}`);
    }

    const kbSaved = await addKnowledge(JID, 'Server Fly', 'Local development pakai fly env', ['devops', 'server']);
    if (kbSaved && kbSaved.title === 'Server Fly') {
      console.log('✅ addKnowledge berhasil menyimpan data.');
    } else {
      throw new Error('❌ addKnowledge gagal menyimpan data!');
    }

    const kbList = await listKnowledge(JID);
    if (kbList.length === 1 && kbList[0].title === 'Server Fly') {
      console.log('✅ listKnowledge berhasil mengambil data.');
    } else {
      throw new Error('❌ listKnowledge gagal mengambil data!');
    }

    const kbSearch = await searchKnowledge(JID, 'fly env', 5);
    if (kbSearch.length > 0 && kbSearch[0].title === 'Server Fly') {
      console.log('✅ searchKnowledge berhasil menemukan data relevan.');
    } else {
      throw new Error('❌ searchKnowledge gagal menemukan data!');
    }

    const kbDeleted = await deleteKnowledge(JID, kbSaved.id);
    if (!kbDeleted) {
      throw new Error('❌ deleteKnowledge gagal menghapus data!');
    }

    const kbAfterDelete = await listKnowledge(JID);
    if (kbAfterDelete.length === 0) {
      console.log('✅ deleteKnowledge berhasil menghapus data.');
    } else {
      throw new Error('❌ deleteKnowledge gagal, data masih tersisa!');
    }

    console.log('\n--- 4. Testing handleMessageEdit Simulasi ---');
    
    // 3.1 Kasus A: Diedit menjadi pengingat baru yang valid
    console.log('\nSub-Test A: Edit pesan menjadi pengingat baru...');
    const editInfoValid = {
      isEdit: true,
      originalMsgId: WA_MSG_ID,
      newText: 'ingatkan 30 menit lagi makan siang'
    };
    
    // Simulasikan edit message
    const mockMsg = { key: { remoteJid: JID } };
    await handleMessageEdit(mockSock, mockMsg, editInfoValid, false);
    
    const dbCheckedA = await getReminderByMsgId(JID, WA_MSG_ID);
    if (dbCheckedA && dbCheckedA.message === 'makan siang') {
      console.log('✅ Sub-Test A BERHASIL: Pengingat di DB terupdate menjadi "makan siang".');
    } else {
      throw new Error('❌ Sub-Test A GAGAL: Pengingat di DB tidak terupdate!');
    }

    // 4.2 Kasus B: Diedit menjadi pesan biasa (bukan pengingat) -> harus memicu pembatalan/delete
    console.log('\nSub-Test B: Edit pesan menjadi teks biasa...');
    const editInfoInvalid = {
      isEdit: true,
      originalMsgId: WA_MSG_ID,
      newText: 'Halo asisten, apa kabar?'
    };

    await handleMessageEdit(mockSock, mockMsg, editInfoInvalid, false);

    const dbCheckedB = await getReminderByMsgId(JID, WA_MSG_ID);
    if (dbCheckedB === null) {
      console.log('✅ Sub-Test B BERHASIL: Pengingat di DB berhasil dibatalkan/dihapus.');
    } else {
      throw new Error('❌ Sub-Test B GAGAL: Pengingat di DB masih ada!');
    }

    console.log('\n🎉 ALL FASE 4 TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err);
  } finally {
    try {
      const pool = getPool();
      await pool.end();
      console.log('Database pool closed.');
    } catch (e) {
      // ignore
    }
    process.exit(0);
  }
}

runTests();
