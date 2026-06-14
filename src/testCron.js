import { parseReminderText } from './ai/reminderService.js';

const testCases = [
  'setiap hari jam 07:00 sarapan pagi',
  'setiap senin jam 09:00 rapat mingguan',
  'setiap jam 10:30 minum air',
  'setiap hari pukul 17.45 olahraga',
  'setiap jumat pukul 13.00 sholat jumat',
  'setiap minggu jam 10:00 ibadah pagi',
];

console.log('=== RUNNING CRON PARSER TESTS ===');
for (const tc of testCases) {
  const result = parseReminderText(tc);
  console.log(`\nInput: "${tc}"`);
  if (result) {
    console.log(`- Clean Task: "${result.cleanTask}"`);
    console.log(`- Cron Expr : "${result.cron}"`);
    console.log(`- TargetTime: ${result.targetTime.toString()}`);
  } else {
    console.log('- Failed to parse!');
  }
}
console.log('\n=== TESTS COMPLETED ===');
