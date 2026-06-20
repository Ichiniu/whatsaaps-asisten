import { DateTime } from 'luxon';

const DEFAULT_TIMEZONE = process.env.BOT_TZ || 'Asia/Jakarta';

const DAY_NAME_TO_WEEKDAY = {
  senin: 1,
  selasa: 2,
  rabu: 3,
  kamis: 4,
  jumat: 5,
  jumaat: 5,
  sabtu: 6,
  minggu: 7,
  ahad: 7
};

function getTimezone() {
  return process.env.BOT_TZ || DEFAULT_TIMEZONE;
}

function normalizeText(text = '') {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function toLabel(dt, referenceNow, originalText) {
  const target = dt.startOf('day');
  const today = referenceNow.startOf('day');
  const diffDays = Math.round(target.diff(today, 'days').days);

  if (/\bhari ini\b/.test(originalText) || diffDays === 0) return 'hari ini';
  if (/\bbesok\b/.test(originalText) || diffDays === 1) return 'besok';
  if (/\blusa\b/.test(originalText) || diffDays === 2) return 'lusa';

  const weekday = target.setLocale('id-ID').toFormat('cccc').toLowerCase();
  return weekday;
}

function resolveNamedDay(text, baseNow) {
  const normalized = normalizeText(text);
  const forceNextWeek = /\b(minggu depan|depan)\b/.test(normalized);

  for (const [dayName, weekday] of Object.entries(DAY_NAME_TO_WEEKDAY)) {
    const regex = new RegExp(`\\b${dayName}\\b`, 'i');
    if (!regex.test(normalized)) continue;

    let target = baseNow.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    let diff = weekday - target.weekday;
    if (diff < 0) diff += 7;
    if (diff === 0 && forceNextWeek) diff = 7;
    if (forceNextWeek && diff < 7) diff += 7;

    target = target.plus({ days: diff });
    return target;
  }

  return null;
}

export function now() {
  const current = DateTime.now().setZone(getTimezone());
  return {
    timezone: getTimezone(),
    nowIso: current.toISO(),
    nowText: current.setLocale('id-ID').toFormat("cccc, d LLLL yyyy HH:mm"),
    dateTime: current
  };
}

export function resolveDateRange(text = '') {
  const current = DateTime.now().setZone(getTimezone());
  const normalized = normalizeText(text);

  let targetDate = current.startOf('day');

  if (/\bbesok\b/.test(normalized)) {
    targetDate = current.plus({ days: 1 }).startOf('day');
  } else if (/\blusa\b/.test(normalized)) {
    targetDate = current.plus({ days: 2 }).startOf('day');
  } else if (/\bhari ini\b/.test(normalized)) {
    targetDate = current.startOf('day');
  } else {
    const namedDay = resolveNamedDay(normalized, current);
    if (namedDay) {
      targetDate = namedDay.startOf('day');
    }
  }

  return {
    timezone: getTimezone(),
    nowIso: current.toISO(),
    nowText: current.setLocale('id-ID').toFormat("cccc, d LLLL yyyy HH:mm"),
    targetDate: targetDate.toISODate(),
    label: toLabel(targetDate, current, normalized),
    startIso: targetDate.startOf('day').toISO(),
    endIso: targetDate.endOf('day').toISO()
  };
}

export function parseReminderDateTime(text = '') {
  const current = DateTime.now().setZone(getTimezone());
  const normalized = normalizeText(text);

  const timeMatch = normalized.match(/(?:jam|pukul)?\s*(\d{1,2})[.:](\d{2})\b/);
  if (!timeMatch) {
    return null;
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) {
    return null;
  }

  const range = resolveDateRange(normalized);
  let target = DateTime.fromISO(range.startIso, { zone: getTimezone() }).set({
    hour,
    minute,
    second: 0,
    millisecond: 0
  });

  const hasExplicitDayContext =
    /\bhari ini\b/.test(normalized) ||
    /\bbesok\b/.test(normalized) ||
    /\blusa\b/.test(normalized) ||
    Object.keys(DAY_NAME_TO_WEEKDAY).some((dayName) => new RegExp(`\\b${dayName}\\b`, 'i').test(normalized));

  if (!hasExplicitDayContext && target <= current) {
    target = target.plus({ days: 1 });
  }

  return {
    timezone: getTimezone(),
    nowIso: current.toISO(),
    nowText: current.setLocale('id-ID').toFormat("cccc, d LLLL yyyy HH:mm"),
    targetDate: target.toISODate(),
    label: toLabel(target, current, normalized),
    startIso: target.startOf('day').toISO(),
    endIso: target.endOf('day').toISO(),
    remindAtIso: target.toISO(),
    remindAtText: target.setLocale('id-ID').toFormat("cccc, d LLLL yyyy HH:mm")
  };
}

export function formatDateId(dt) {
  const value = typeof dt === 'string'
    ? DateTime.fromISO(dt, { zone: getTimezone() })
    : DateTime.fromJSDate(dt instanceof Date ? dt : new Date(dt), { zone: getTimezone() });

  return value.setLocale('id-ID').toFormat('cccc, d LLLL yyyy');
}

export function formatDateTimeId(dt) {
  const value = typeof dt === 'string'
    ? DateTime.fromISO(dt, { zone: getTimezone() })
    : DateTime.fromJSDate(dt instanceof Date ? dt : new Date(dt), { zone: getTimezone() });

  return value.setLocale('id-ID').toFormat('cccc, d LLLL yyyy HH:mm');
}