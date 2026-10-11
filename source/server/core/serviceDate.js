/**
 * Travel dates (service calendar). A date is a plain calendar day in Vietnam time (UTC+7, no daylight saving),
 * written YYYY-MM-DD; "today" is always the server's, never the device's, so a wrong phone clock cannot shift
 * a booking. Passengers may book from today up to BOOKING_WINDOW_DAYS ahead.
 */

export const TIMEZONE = 'Asia/Ho_Chi_Minh';
export const BOOKING_WINDOW_DAYS = 30;
// The day the seed trips run on (driver and ops boards use them). Outside production it stays bookable so the
// live demo keeps working (decision D120).
export const DEMO_DATE = '2026-08-28';

const VN_OFFSET_MS = 7 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar day (YYYY-MM-DD, Vietnam time) of an instant. */
export function vnDate(ms = Date.now()) {
  return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** A strict YYYY-MM-DD that exists in the calendar (no 2026-02-30, no "28/08"), or null. */
export function parseServiceDate(value) {
  if (typeof value !== 'string') return null;
  const m = value.match(DATE_RE);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value ? value : null;
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Today, the last bookable day and the demo day the app may offer. */
export function serviceCalendar(now = Date.now(), { production = false } = {}) {
  const today = vnDate(now);
  return {
    timezone: TIMEZONE,
    today,
    booking_window_days: BOOKING_WINDOW_DAYS,
    last_date: addDays(today, BOOKING_WINDOW_DAYS),
    demo_dates: production ? [] : [DEMO_DATE]
  };
}

/** Whether passengers may search and book this travel date. */
export function checkTravelDate(value, now = Date.now(), { production = false } = {}) {
  const date = parseServiceDate(value);
  if (!date) return { ok: false, code: 'INVALID_DATE', message: 'Ngày đi không hợp lệ (định dạng YYYY-MM-DD)' };
  if (!production && date === DEMO_DATE) return { ok: true, date };
  const { today, last_date: last } = serviceCalendar(now);
  if (date < today) return { ok: false, code: 'DATE_IN_PAST', message: 'Ngày đi đã qua' };
  if (date > last) return { ok: false, code: 'DATE_BEYOND_WINDOW', message: `Chỉ đặt trước tối đa ${BOOKING_WINDOW_DAYS} ngày (đến ${last.split('-').reverse().join('/')})` };
  return { ok: true, date };
}

/**
 * Whether a trip may still be sold: it has not left yet and its day is inside the booking window. Checked again
 * when seats are held and when the order is made, so a crafted request cannot book a past or far-future run.
 */
export function checkBookableDeparture(departureTime, now = Date.now(), { production = false } = {}) {
  const departure = Date.parse(departureTime);
  if (!Number.isFinite(departure)) return { ok: false, code: 'TRIP_NOT_BOOKABLE', message: 'Chuyến xe không còn bán vé' };
  const day = checkTravelDate(vnDate(departure), now, { production });
  if (!day.ok) return day.code === 'DATE_IN_PAST' ? { ok: false, code: 'TRIP_DEPARTED', message: 'Chuyến xe đã chạy' } : day;
  if (!production && day.date === DEMO_DATE) return { ok: true };
  if (departure <= now) return { ok: false, code: 'TRIP_DEPARTED', message: 'Chuyến xe đã chạy' };
  return { ok: true };
}

/** Id of the run of a schedule on a day: `trp_hn_th_01_20261015`. */
export function runId(templateId, date) {
  return `${templateId}_${date.replaceAll('-', '')}`;
}

/** { templateId, date } of a run id, or null. */
export function parseRunId(tripId) {
  const m = typeof tripId === 'string' && tripId.match(/^(.+)_(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const date = parseServiceDate(`${m[2]}-${m[3]}-${m[4]}`);
  return date ? { templateId: m[1], date } : null;
}
