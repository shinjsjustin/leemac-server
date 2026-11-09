export const MAX_SIDE = 2000;

/** Scales width and height so the long side is at most max; never enlarges. */
export function fitWithin(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const newestFirst = (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id;

/** A client marking takes its company's jobs; a Leemac marking takes every job. */
export function jobsFor(marking, jobs) {
  const allowed = marking.company_id === null ? jobs : jobs.filter((j) => j.company_id === marking.company_id);
  return [...allowed].sort(newestFirst);
}

export const defaultJobId = (marking, jobs) => jobsFor(marking, jobs)[0]?.id ?? null;

/** Returns the full order after moving id one place; it stays put at either end. */
export function moveId(ids, id, direction) {
  const from = ids.indexOf(id);
  const to = direction === 'left' ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Flattens the job groups from getAdminPartQc into { [markingId]: photos in position order }. */
export function photosByMarking(groups) {
  const byMarking = {};
  groups.forEach(({ job_id: jobId, job_number: jobNumber, photos }) => {
    photos.forEach((photo) => {
      (byMarking[photo.marking_id] ||= []).push({ ...photo, job_id: jobId, job_number: jobNumber });
    });
  });
  Object.values(byMarking).forEach((list) => list.sort((a, b) => a.position - b.position));
  return byMarking;
}
