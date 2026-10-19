export function isAllowed(decoded, { role = 'admin', minLevel = 2 } = {}, now = Date.now()) {
  if (!decoded || typeof decoded !== 'object') return false;
  if (decoded.exp * 1000 <= now) return false;
  if (role === 'admin') {
    return decoded.role === 'admin' && Number.isInteger(decoded.access) && decoded.access >= minLevel;
  }
  if (role === 'client') {
    return decoded.role === 'client' && Number.isInteger(decoded.company_id) && decoded.company_id > 0;
  }
  return false;
}
