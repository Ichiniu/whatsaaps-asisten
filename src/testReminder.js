import { parseReminderText } from './ai/reminderService.js';

console.log('=== TESTING REMINDER PARSER ===');

const tests = [
  {
    input: '14 Desember 2026 pukul 12:00 kegiatan daerah kegiatan untuk menghabiskan dana hibah dilaksanakan di Jogja',
    expectedDate: '2026-12-14T12:00:00',
    expectedTask: 'kegiatan untuk menghabiskan dana hibah dilaksanakan di Jogja'
  },
  {
    input: '10 menit lagi beli susu',
    relative: true,
    expectedTask: 'beli susu'
  },
  {
    input: 'besok jam 12:00 rapat koordinasi',
    expectedTask: 'rapat koordinasi'
  },
  {
    input: 'pada tanggal 25 januari 2029 ke suramadu menggunakan mobil mulai jam 20.00-24.00',
    expectedTask: 'suramadu'
  },
  {
    input: 'pada tanggal 25 januari 2029 ke suramadu menggunakan mobil aku yang serir',
    expectedTask: 'suramadu'
  }
];



tests.forEach((t, idx) => {
  console.log(`\nTest #${idx + 1}: "${t.input}"`);
  const result = parseReminderText(t.input);
  if (!result) {
    console.error('❌ Gagal: Parser mengembalikan null');
    return;
  }
  
  console.log('✅ Waktu target:', result.targetTime.toLocaleString('id-ID'));
  console.log('✅ Tugas bersih:', `"${result.cleanTask}"`);
  
  if (t.expectedTask && !result.cleanTask.includes(t.expectedTask)) {
    console.warn(`⚠️ Warning: Tugas tidak sesuai ekspektasi. Ekspektasi mengandung "${t.expectedTask}"`);
  }
});

console.log('\n=== TEST SELESAI ===');
