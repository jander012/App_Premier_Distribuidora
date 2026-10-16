import { query } from '../config/db.js';

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DEFAULT_TZ = 'America/Cuiaba';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseTimeToMinutes(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesToTime(mins) {
  if (mins == null || !Number.isFinite(mins)) return null;
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/** Relógio local da loja (dia 0–6 e minutos desde meia-noite). */
export function getStoreClock(timeZone = DEFAULT_TZ, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || DEFAULT_TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[get('weekday')] ?? at.getDay();
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  return {
    dayOfWeek,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
    timeZone: timeZone || DEFAULT_TZ,
  };
}

function normalizeDayRow(row, dayOfWeek) {
  const closed = Boolean(row?.closed);
  const openMins = parseTimeToMinutes(row?.open_time ?? row?.openTime);
  const closeMins = parseTimeToMinutes(row?.close_time ?? row?.closeTime);
  return {
    dayOfWeek,
    label: DAY_LABELS[dayOfWeek],
    closed: closed || openMins == null || closeMins == null,
    openTime: closed ? null : minutesToTime(openMins),
    closeTime: closed ? null : minutesToTime(closeMins),
  };
}

export function emptyWeek() {
  return Array.from({ length: 7 }, (_, dayOfWeek) =>
    normalizeDayRow({ closed: true, open_time: null, close_time: null }, dayOfWeek)
  );
}

export async function listWeeklyHours(storeId) {
  const { rows } = await query(
    `SELECT day_of_week, closed, open_time, close_time
       FROM store_weekly_hours
      WHERE store_id = $1
      ORDER BY day_of_week ASC`,
    [storeId]
  );
  const byDay = new Map(rows.map((r) => [Number(r.day_of_week), r]));
  return Array.from({ length: 7 }, (_, dayOfWeek) => normalizeDayRow(byDay.get(dayOfWeek), dayOfWeek));
}

export async function replaceWeeklyHours(storeId, days) {
  const list = Array.isArray(days) ? days : [];
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1) {
    const raw = list.find((d) => Number(d.dayOfWeek ?? d.day_of_week) === dayOfWeek) || {};
    const closed = Boolean(raw.closed) || !parseTimeToMinutes(raw.openTime ?? raw.open_time) || !parseTimeToMinutes(raw.closeTime ?? raw.close_time);
    const openTime = closed ? null : minutesToTime(parseTimeToMinutes(raw.openTime ?? raw.open_time));
    const closeTime = closed ? null : minutesToTime(parseTimeToMinutes(raw.closeTime ?? raw.close_time));
    await query(
      `INSERT INTO store_weekly_hours (store_id, day_of_week, closed, open_time, close_time)
       VALUES ($1, $2, $3, $4, $5)
       ON DUPLICATE KEY UPDATE closed = VALUES(closed), open_time = VALUES(open_time), close_time = VALUES(close_time)`,
      [storeId, dayOfWeek, closed, openTime, closeTime]
    );
  }
  return listWeeklyHours(storeId);
}

/**
 * true se o horário semanal indica aberta agora.
 * Janela overnight: open 22:00 close 02:00.
 */
export function isOpenBySchedule(week, clock) {
  const days = Array.isArray(week) && week.length ? week : emptyWeek();
  const today = days.find((d) => d.dayOfWeek === clock.dayOfWeek) || normalizeDayRow(null, clock.dayOfWeek);
  const yesterdayDow = (clock.dayOfWeek + 6) % 7;
  const yesterday = days.find((d) => d.dayOfWeek === yesterdayDow) || normalizeDayRow(null, yesterdayDow);

  const openToday = parseTimeToMinutes(today.openTime);
  const closeToday = parseTimeToMinutes(today.closeTime);
  if (!today.closed && openToday != null && closeToday != null) {
    if (closeToday > openToday) {
      if (clock.minutes >= openToday && clock.minutes < closeToday) return true;
    } else if (closeToday < openToday) {
      // overnight starting today
      if (clock.minutes >= openToday) return true;
    }
  }

  const openY = parseTimeToMinutes(yesterday.openTime);
  const closeY = parseTimeToMinutes(yesterday.closeTime);
  if (!yesterday.closed && openY != null && closeY != null && closeY < openY) {
    // still in yesterday's overnight window
    if (clock.minutes < closeY) return true;
  }
  return false;
}

/** Início do período atual (open ou closed) em minutos absolutos aproximados via Date local da TZ. */
export function currentPeriodStartedAt(week, clock, at = new Date()) {
  const open = isOpenBySchedule(week, clock);
  const today = week.find((d) => d.dayOfWeek === clock.dayOfWeek);
  const openToday = parseTimeToMinutes(today?.openTime);
  const closeToday = parseTimeToMinutes(today?.closeTime);

  // Build a Date in the store TZ roughly by adjusting from Intl parts — use wall-clock string.
  const tz = clock.timeZone || DEFAULT_TZ;
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const y = dateParts.find((p) => p.type === 'year')?.value;
  const mo = dateParts.find((p) => p.type === 'month')?.value;
  const da = dateParts.find((p) => p.type === 'day')?.value;

  function wallDate(hourMin, dayOffset = 0) {
    const base = new Date(`${y}-${mo}-${da}T${minutesToTime(hourMin)}:00`);
    if (dayOffset) base.setDate(base.getDate() + dayOffset);
    return base;
  }

  if (open) {
    if (openToday != null && closeToday != null && closeToday < openToday && clock.minutes < closeToday) {
      // overnight from yesterday
      return wallDate(openToday, -1);
    }
    if (openToday != null) return wallDate(openToday, 0);
  } else if (closeToday != null && openToday != null && clock.minutes >= closeToday && closeToday > openToday) {
    return wallDate(closeToday, 0);
  } else if (openToday != null && clock.minutes < openToday) {
    // closed before open — period started at yesterday close or midnight
    const yest = week.find((d) => d.dayOfWeek === (clock.dayOfWeek + 6) % 7);
    const closeY = parseTimeToMinutes(yest?.closeTime);
    const openY = parseTimeToMinutes(yest?.openTime);
    if (closeY != null && openY != null && closeY > openY) return wallDate(closeY, -1);
  }
  // fallback: start of local day
  return wallDate(0, 0);
}

export { DAY_LABELS, DEFAULT_TZ, parseTimeToMinutes, minutesToTime };
