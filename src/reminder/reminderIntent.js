import { parseReminderDateTime, resolveDateRange } from '../utils/timeContext.js';

function normalizeText(text = '') {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function cleanupReminderMessage(text = '') {
  return text
    .replace(/\b(ingatkan aku|ingatkan saya|ingatkan|reminder|jadwalkan)\b/gi, '')
    .replace(/\b(hari ini|besok|lusa)\b/gi, '')
    .replace(/\b(senin|selasa|rabu|kamis|jumat|jumaat|sabtu|minggu|ahad)\b/gi, '')
    .replace(/\b(minggu depan|depan)\b/gi, '')
    .replace(/\b(jam|pukul)\s*\d{1,2}[.:]\d{2}\b/gi, '')
    .replace(/\b\d{1,2}[.:]\d{2}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(untuk|soal|agenda|jadwal)\s+/i, '')
    .trim();
}

export function detectReminderIntent(text = '') {
  const normalized = normalizeText(text);

  if (
    /\b(hapus|bersihkan)\b/.test(normalized) &&
    /\b(semua)\b/.test(normalized) &&
    /\b(reminder|pengingat|jadwal)\b/.test(normalized)
  ) {
    return {
      intent: 'delete_all_reminders'
    };
  }

  if (
    /\b(jadwal|agenda|reminder|pengingat)\b/.test(normalized) &&
    (
      /\b(hari ini|besok|lusa)\b/.test(normalized) ||
      /\b(senin|selasa|rabu|kamis|jumat|jumaat|sabtu|minggu|ahad)\b/.test(normalized)
    )
  ) {
    return {
      intent: 'list_schedule',
      range: resolveDateRange(normalized)
    };
  }

  if (
    /\b(ingatkan|reminder|jadwalkan)\b/.test(normalized) &&
    /(?:\bjam\b|\bpukul\b|\b\d{1,2}[.:]\d{2}\b)/.test(normalized)
  ) {
    const parsedDateTime = parseReminderDateTime(normalized);
    if (!parsedDateTime) return null;

    const reminderMessage = cleanupReminderMessage(text);
    if (!reminderMessage) return null;

    return {
      intent: 'create_reminder',
      message: reminderMessage,
      dateTime: parsedDateTime
    };
  }

  if (
    /\b(reminder|pengingat)\b/.test(normalized) &&
    (
      /\bhari ini\b/.test(normalized) ||
      /\bbesok\b/.test(normalized) ||
      /\blusa\b/.test(normalized)
    )
  ) {
    return {
      intent: 'list_schedule',
      range: resolveDateRange(normalized)
    };
  }

  return null;
}