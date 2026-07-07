// src/lib/ai/time.js
// Single source of truth for shop-local time (America/Toronto).
// All Jarvis session dates and prompt timestamps should use these helpers
// so that evening chats never land in tomorrow's UTC-based session.

const SHOP_TZ = 'America/Toronto';

/**
 * Returns the shop's current calendar date as 'YYYY-MM-DD'.
 * en-CA locale formats as YYYY-MM-DD natively; confirmed correct in Node ICU.
 * @param {Date} [date]
 */
function torontoDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: SHOP_TZ });
}

/**
 * Returns a human-readable "now" string for system prompts.
 * Format: "Sunday, July 5, 2026 at 11:30 PM"
 * @param {Date} [date]
 */
function torontoNowString(date = new Date()) {
  return date.toLocaleString('en-US', {
    timeZone: SHOP_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Milliseconds that `timeZone` is ahead of UTC at the given instant.
 * Positive west-of-UTC zones return negative values (Toronto is negative).
 * @param {string} timeZone
 * @param {Date} date
 */
function tzOffsetMs(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map = {};
  for (const { type, value } of dtf.formatToParts(date)) map[type] = value;
  // Intl can emit hour '24' at midnight; normalize to 0.
  const hour = map.hour === '24' ? 0 : Number(map.hour);
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return asUTC - date.getTime();
}

/**
 * Converts a wall-clock time in America/Toronto to the corresponding UTC Date.
 * @param {number} y  full year
 * @param {number} m  1-based month
 * @param {number} d  day of month (overflow is allowed, e.g. day 32)
 * @param {number} [hh]
 * @param {number} [mm]
 * @param {number} [ss]
 */
function torontoWallToUtc(y, m, d, hh = 0, mm = 0, ss = 0) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss);
  const offset = tzOffsetMs(SHOP_TZ, new Date(guess));
  return new Date(guess - offset);
}

/**
 * Start/end instants (as Date objects) for a single America/Toronto calendar day.
 * `start` is that day at 00:00 Toronto; `end` is the following day at 00:00 Toronto
 * (i.e. 24:00 of the given day), so the range is half-open [start, end).
 * @param {string} [dateString] 'YYYY-MM-DD'; defaults to today in Toronto.
 */
function torontoDayBounds(dateString = torontoDateString()) {
  const [y, m, d] = dateString.split('-').map(Number);
  return {
    start: torontoWallToUtc(y, m, d, 0, 0, 0),
    end: torontoWallToUtc(y, m, d + 1, 0, 0, 0),
  };
}

module.exports = { SHOP_TZ, torontoDateString, torontoNowString, torontoDayBounds };
