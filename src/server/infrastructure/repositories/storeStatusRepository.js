import { query } from '../config/db.js';

const OPEN = 'open';
const CLOSED = 'closed';
const DEFAULT_STATUS = OPEN;

function normalizeStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === OPEN || s === 'aberto') return OPEN;
  if (s === CLOSED || s === 'fechado') return CLOSED;
  return null;
}

function toMysqlDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toLocalDateKey(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}

function parseMonth(month) {
  const raw = String(month || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const monthIndex = match ? Number(match[2]) - 1 : now.getMonth();
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return {
      label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  return {
    label: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 1),
  };
}

function makeDayStats(start, end) {
  const days = [];
  for (const d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const key = toLocalDateKey(d);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    days.push({
      date: key,
      openMinutes: 0,
      closeCount: 0,
      start: new Date(d),
      end: next,
    });
  }
  return days;
}

function addOpenMinutes(days, from, to) {
  if (!(from < to)) return;
  for (const day of days) {
    const segStart = from > day.start ? from : day.start;
    const segEnd = to < day.end ? to : day.end;
    if (segStart < segEnd) {
      day.openMinutes += Math.round((segEnd.getTime() - segStart.getTime()) / 60000);
    }
  }
}

function serializeEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    status: row.status,
    reason: row.reason || '',
    createdByAdminId: row.created_by_admin_id,
    createdAt: row.created_at,
  };
}

export function normalizeStoreStatus(status) {
  return normalizeStatus(status);
}

export async function getCurrentStatus(storeId) {
  const { rows } = await query(
    `SELECT *
       FROM store_status_events
      WHERE store_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [storeId]
  );
  const latest = rows[0] || null;
  return {
    status: latest?.status || DEFAULT_STATUS,
    isOpen: (latest?.status || DEFAULT_STATUS) === OPEN,
    latestEvent: serializeEvent(latest),
  };
}

export async function createStatusEvent(storeId, status, { reason = null, adminId = null } = {}) {
  const normalized = normalizeStatus(status);
  if (!normalized) throw new Error('Status inválido');
  await query(
    `INSERT INTO store_status_events (store_id, status, reason, created_by_admin_id)
     VALUES ($1, $2, $3, $4)`,
    [storeId, normalized, reason, adminId]
  );
  return getCurrentStatus(storeId);
}

export async function getMonthlySummary(storeId, month) {
  const { label, start, end } = parseMonth(month);
  const now = new Date();
  const periodEnd = now < end && now >= start ? now : end;
  const startSql = toMysqlDateTime(start);
  const endSql = toMysqlDateTime(end);

  const [{ rows: previousRows }, { rows: eventRows }] = await Promise.all([
    query(
      `SELECT *
         FROM store_status_events
        WHERE store_id = $1 AND created_at < $2
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [storeId, startSql]
    ),
    query(
      `SELECT *
         FROM store_status_events
        WHERE store_id = $1 AND created_at >= $2 AND created_at < $3
        ORDER BY created_at ASC, id ASC`,
      [storeId, startSql, endSql]
    ),
  ]);

  const days = makeDayStats(start, end);
  let currentStatus = previousRows[0]?.status || DEFAULT_STATUS;
  let cursor = start;

  for (const event of eventRows) {
    const eventAt = new Date(event.created_at);
    const boundedAt = eventAt > periodEnd ? periodEnd : eventAt;
    if (currentStatus === OPEN) addOpenMinutes(days, cursor, boundedAt);
    if (event.status === CLOSED) {
      const key = toLocalDateKey(eventAt);
      const day = days.find((item) => item.date === key);
      if (day) day.closeCount += 1;
    }
    currentStatus = event.status;
    cursor = boundedAt;
  }

  if (cursor < periodEnd && currentStatus === OPEN) {
    addOpenMinutes(days, cursor, periodEnd);
  }

  const serializedDays = days.map(({ start: _start, end: _end, ...day }) => day);
  const totalOpenMinutes = serializedDays.reduce((sum, day) => sum + day.openMinutes, 0);
  const totalCloseCount = serializedDays.reduce((sum, day) => sum + day.closeCount, 0);

  return {
    month: label,
    totalOpenMinutes,
    totalCloseCount,
    days: serializedDays,
    events: eventRows.slice(-20).reverse().map(serializeEvent),
  };
}
