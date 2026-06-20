import cron from 'node-cron';
import { getDueReminders, markDone } from '../reminder/reminderRepository.js';

let schedulerTask = null;

export function startReminderScheduler(sock) {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }

  schedulerTask = cron.schedule('* * * * *', async () => {
    try {
      const reminders = await getDueReminders();

      for (const reminder of reminders) {
        try {
          await sock.sendMessage(reminder.chat_id, {
            text: `⏰ Reminder:\n${reminder.message}`
          });

          await markDone(reminder.id);
        } catch (sendErr) {
          console.error('[scheduler] Gagal kirim reminder:', sendErr);
        }
      }
    } catch (err) {
      console.error('[scheduler] Error scheduler reminder:', err);
    }
  });

  return schedulerTask;
}

export function stopReminderScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
  }
}