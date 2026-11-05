const SHARED_PATH = /^\/client-shared\/[A-Za-z0-9_-]{43}$/;
const DEFAULT_PATH = '/client-overview';

// Only a share link may be returned to, so next can never become an open redirect.
export function safeReturnPath(next) {
  return typeof next === 'string' && SHARED_PATH.test(next) ? next : DEFAULT_PATH;
}

// The query string that carries a valid next onward, or '' when there is none.
export function nextQuery(next) {
  const path = safeReturnPath(next);
  return path === DEFAULT_PATH ? '' : `?next=${encodeURIComponent(path)}`;
}
