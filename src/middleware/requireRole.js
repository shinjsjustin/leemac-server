/**
 * Role guards. Use after isAuth, which sets req.user from the JWT.
 */

function requireAdmin(minLevel) {
    return (req, res, next) => {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        if (user.role !== 'admin' || !Number.isInteger(user.access) || user.access < minLevel) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}

const READ_METHODS = new Set(['GET', 'HEAD']);

function pathMatches(pattern, path) {
    const want = pattern.split('/');
    const got = path.split('/');
    return want.length === got.length && want.every((seg, i) => seg.startsWith(':') || seg === got[i]);
}

/**
 * Reads pass; a write passes only if its method and path match an allow entry
 * ([method, pattern] with optional :param segments); otherwise it needs minLevel.
 */
function requireAdminForWrites(minLevel, allow) {
    const needsLevel = requireAdmin(minLevel);
    return (req, res, next) => {
        if (READ_METHODS.has(req.method)) return next();
        if (allow.some(([method, pattern]) => method === req.method && pathMatches(pattern, req.path))) return next();
        return needsLevel(req, res, next);
    };
}

function requireClient(req, res, next) {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role !== 'client' || !Number.isInteger(user.company_id) || user.company_id <= 0) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

module.exports = { requireAdmin, requireAdminForWrites, requireClient };
