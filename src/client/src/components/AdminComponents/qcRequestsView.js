const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const STATUS_LABELS = { answered: 'Answered', dismissed: 'Dismissed' };

export function statusLabel(row) {
  if (row.status !== 'open') return STATUS_LABELS[row.status];
  return row.photo_count > 0 ? 'Photos started' : 'Waiting for photos';
}

export function splitRequests(rows) {
  return {
    open: rows.filter((row) => row.status === 'open'),
    closed: rows.filter((row) => row.status !== 'open'),
  };
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const DAY_MS = 24 * HOUR_MS;

export function pingedLabel(iso, now) {
  const pinged = new Date(iso);
  const elapsed = now.getTime() - pinged.getTime();
  if (elapsed < HOUR_MS) return `${Math.max(0, Math.floor(elapsed / MINUTE_MS))} min ago`;
  const dayGap = Math.round((startOfDay(now) - startOfDay(pinged)) / DAY_MS);
  if (dayGap === 0) return `${Math.floor(elapsed / HOUR_MS)} h ago`;
  if (dayGap === 1) return 'yesterday';
  return pinged.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
