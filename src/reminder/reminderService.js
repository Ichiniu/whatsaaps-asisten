import { detectReminderIntent } from './reminderIntent.js';
import {
  createOrUpdateReminder,
  deleteAllForUser,
  listByRange
} from './reminderRepository.js';
import { formatDateId, formatDateTimeId } from '../utils/timeContext.js';

function normalizeLines(text = '') {
  return text.replace(/\r/g, '').trim();
}

export async function handleReminderText({ text, messageKey, isEdit = false }) {
  const cleanText = normalizeLines(text);
  if (!cleanText) return null;

  const parsed = detectReminderIntent(cleanText);
  if (!parsed) return null;

  const userId = messageKey?.participant || messageKey?.remoteJid;
  const chatId = messageKey?.remoteJid;
  const sourceMessageId = messageKey?.id;

  if (!userId || !chatId) return null;

  if (parsed.intent === 'delete_all_reminders') {
    const deletedCount = await deleteAllForUser(userId);
    return `Siap, ${deletedCount} data reminder kamu sudah benar-benar dihapus dari database.`;
  }

  if (parsed.intent === 'list_schedule') {
    const reminders = await listByRange(
      userId,
      parsed.range.startIso,
      parsed.range.endIso
    );

    const formattedDate = formatDateId(parsed.range.startIso);

    if (!reminders.length) {
      return `Untuk ${parsed.range.label} (${formattedDate}), belum ada jadwal/reminder yang tersimpan di database.`;
    }

    const lines = reminders.map((item, index) => {
      const timeOnly = new Intl.DateTimeFormat('id-ID', {
        timeZone: parsed.range.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(item.remind_at));

      return `${index + 1}. ${timeOnly} - ${item.message}`;
    });

    return `Jadwal kamu untuk ${parsed.range.label} (${formattedDate}):\n\n${lines.join('\n')}`;
  }

  if (parsed.intent === 'create_reminder') {
    const saved = await createOrUpdateReminder({
      userId,
      chatId,
      sourceMessageId,
      message: parsed.message,
      remindAt: parsed.dateTime.remindAtIso
    });

    const formattedDateTime = formatDateTimeId(saved.remind_at);

    if (isEdit) {
      return `Reminder dari pesan yang diedit sudah diperbarui:\n${saved.message}\nWaktu: ${formattedDateTime}`;
    }

    return `Siap, reminder disimpan:\n${saved.message}\nWaktu: ${formattedDateTime}`;
  }

  return null;
}