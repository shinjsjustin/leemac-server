const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { isSessionLive } = require('../lib/sessions');

const createIsAuth = ({ invalidTokenStatus = 403 } = {}) => (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
    if (token == null) {
        return res.status(401).json({ message: 'Token is NULL' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err || user.purpose !== undefined || typeof user.sid !== 'string' || !user.role) {
            return res.status(invalidTokenStatus).json({ message: 'Token is INVALID' });
        }
        try {
            if (!(await isSessionLive(db, user.sid, user.role, user.id))) {
                return res.status(401).json({ message: 'Session expired' });
            }
        } catch (e) {
            console.error('isAuth session lookup failed:', e);
            return res.status(500).json({ message: 'Server error' });
        }
        req.user = user;
        next();
    });
};

module.exports = createIsAuth();
module.exports.createIsAuth = createIsAuth;
