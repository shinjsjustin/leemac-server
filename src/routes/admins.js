const express = require('express');
const router = express.Router();
const db = require('../db/db');
const { revokeAllSessions } = require('../lib/sessions');
const { revokeAllTrustedDevices, listTrustedDevices, revokeTrustedDevice } = require('../lib/trustedDevices');

const USER_TABLES = { admin: 'admin', client: 'clients' };

// Returns the validated target, or null when the body is not a valid { userType, userId }.
function parseTarget(body) {
    const { userType, userId } = body;
    if (!Object.hasOwn(USER_TABLES, userType) || !Number.isInteger(userId)) return null;
    return { userType, userId, table: USER_TABLES[userType] };
}

// GET domain.com/api/internal/admins/getadmins
// Retrieve all admin accounts with id, name, access_level, email, and company_id. Reads: admin table.
router.get('/getadmins', async (req, res) => {
    try {
        const [admins] = await db.query(
            'SELECT id, name, access_level, email, company_id FROM admin'
        );
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// GET domain.com/api/internal/admins/getadmin/:id
// Retrieve name, email, and company_id for a specific admin by their ID. Reads: admin table.
router.get('/getadmin/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [admin] = await db.query(
            'SELECT name, email, company_id FROM admin WHERE id = ?',
            [id]
        );
        if (admin.length === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }
        res.json(admin[0]);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// PUT domain.com/api/internal/admins/editadmin
// Update an admin's name, access_level, email, or company_id by ID. Affects: admin table.
router.put('/editadmin', async (req, res) => {
    const { id, name, access_level, email, company_id } = req.body;
    if (!id || (!name && !access_level && !email && !company_id)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    if (access_level != null && Number(id) === req.user.id) {
        return res.status(403).json({ error: 'Cannot change your own access level' });
    }
    try {
        const [result] = await db.query(
            'UPDATE admin SET email_verified_at = IF(? IS NOT NULL AND ? <> email, NULL, email_verified_at), name = COALESCE(?, name), access_level = COALESCE(?, access_level), email = COALESCE(?, email), company_id = COALESCE(?, company_id) WHERE id = ?',
            [email, email, name, access_level, email, company_id, id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Admin not found' });
        }
        res.json({ message: 'Admin updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// POST domain.com/api/internal/admins/force-logout
// End all of a user's sessions. Body: { userType: 'admin'|'client', userId }. Affects: auth_session table.
router.post('/force-logout', async (req, res) => {
    const target = parseTarget(req.body);
    if (!target) {
        return res.status(400).json({ error: 'Invalid userType or userId' });
    }
    try {
        await revokeAllSessions(db, target.userType, target.userId);
        res.json({ message: 'Sessions revoked' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// POST domain.com/api/internal/admins/reset-2fa
// Clear a user's 2FA setup and end their sessions. Affects: admin or clients, auth_backup_code, auth_session tables.
router.post('/reset-2fa', async (req, res) => {
    const target = parseTarget(req.body);
    if (!target) {
        return res.status(400).json({ error: 'Invalid userType or userId' });
    }
    try {
        const [result] = await db.query(
            `UPDATE ${target.table} SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL WHERE id = ?`,
            [target.userId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        await db.query(
            'DELETE FROM auth_backup_code WHERE user_type = ? AND user_id = ?',
            [target.userType, target.userId]
        );
        await revokeAllSessions(db, target.userType, target.userId);
        if (target.userType === 'admin') await revokeAllTrustedDevices(db, target.userId);
        res.json({ message: '2FA reset' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// GET domain.com/api/internal/admins/trusted-devices/:adminId
// List an admin's trusted browsers. Reads: admin_trusted_device table.
router.get('/trusted-devices/:adminId', async (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.adminId)) {
        return res.status(400).json({ error: 'Invalid adminId' });
    }
    try {
        res.json({ devices: await listTrustedDevices(db, Number(req.params.adminId)) });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// POST domain.com/api/internal/admins/revoke-trusted-devices
// Revoke one trusted browser, or all when deviceId is omitted. Body: { adminId, deviceId? }. Affects: admin_trusted_device table.
router.post('/revoke-trusted-devices', async (req, res) => {
    const { adminId, deviceId } = req.body;
    const isPositiveInt = (n) => Number.isInteger(n) && n > 0;
    if (!isPositiveInt(adminId) || (deviceId !== undefined && !isPositiveInt(deviceId))) {
        return res.status(400).json({ error: 'Invalid adminId or deviceId' });
    }
    try {
        if (deviceId === undefined) {
            await revokeAllTrustedDevices(db, adminId);
        } else if (!(await revokeTrustedDevice(db, adminId, deviceId))) {
            return res.status(404).json({ error: 'Trusted browser not found' });
        }
        res.json({ message: 'Trusted browsers revoked' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// POST domain.com/api/internal/admins/admin-job
// Link an admin to a job, creating a many-to-many relationship. Affects: job_admin table.
router.post('/admin-job', async (req, res) => {
    const { job_id, admin_id } = req.body;
    if (!job_id || !admin_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        await db.query(
            'INSERT INTO job_admin (job_id, admin_id) VALUES (?, ?)',
            [job_id, admin_id]
        );
        res.status(201).json({ message: 'Admin-job relationship created successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// DELETE domain.com/api/internal/admins/admin-job
// Remove the link between an admin and a job. Affects: job_admin table.
router.delete('/admin-job', async (req, res) => {
    const { job_id, admin_id } = req.body;
    if (!job_id || !admin_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        const [result] = await db.query(
            'DELETE FROM job_admin WHERE job_id = ? AND admin_id = ?',
            [job_id, admin_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Admin-job relationship not found' });
        }
        res.json({ message: 'Admin-job relationship deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

// GET domain.com/api/internal/admins/getlinkedjobs/:adminId
// Get all job IDs linked to a specific admin. Reads: job_admin table.
router.get('/getlinkedjobs/:adminId', async (req, res) => {
    const { adminId } = req.params;
    try {
        const [linkedJobs] = await db.query(
            'SELECT job_id FROM job_admin WHERE admin_id = ?',
            [adminId]
        );
        res.json(linkedJobs);
    } catch (error) {
        res.status(500).json({ error: 'Database error', details: error.message });
    }
});

module.exports = router;

