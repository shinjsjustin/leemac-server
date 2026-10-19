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

function requireClient(req, res, next) {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.role !== 'client' || !Number.isInteger(user.company_id) || user.company_id <= 0) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

module.exports = { requireAdmin, requireClient };
