const express = require('express');
const multer = require('multer');
const defaultDb = require('../db/db');
const { requireAdmin } = require('../middleware/requireRole');
const { QcError } = require('../lib/qcMarkings');
const leemacMarkings = require('../lib/qcLeemacMarkings');
const qcPhotos = require('../lib/qcPhotos');
const qcRequests = require('../lib/qcRequests');

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const READ_LEVEL = 2;
const WRITE_LEVEL = 3;
const PHOTO_MAX_BYTES = 3 * 1024 * 1024;
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_CREATED = 201;
const NOT_FOUND = { error: 'Not found' };
const OK = { ok: true };

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PHOTO_MAX_BYTES } });

function validateId(req, res, next, value) {
    if (!ID_PATTERN.test(value)) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
    next();
}

// Runs the multer parse and maps its failures to JSON errors.
function receivePhoto(req, res, next) {
    upload.single('photo')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(HTTP_PAYLOAD_TOO_LARGE).json({ error: 'Photo must be 3 MB or smaller' });
        }
        if (err instanceof multer.MulterError) return res.status(HTTP_BAD_REQUEST).json({ error: err.message });
        next(err);
    });
}

// Wraps a handler: QcError keeps its status, anything else is a generic 500.
// A handler may return { send } to answer with its own response.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req, res);
            if (result.send) return result.send();
            res.status(result.status || 200).json(result.body);
        } catch (error) {
            if (error instanceof QcError) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error('Admin QC error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

function createQcAdminRouter({ db = defaultDb } = {}) {
    const router = express.Router();
    const read = requireAdmin(READ_LEVEL);
    const write = requireAdmin(WRITE_LEVEL);

    router.use((req, res, next) => {
        res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        next();
    });
    router.param('id', validateId);

    async function markingPartId(id) {
        const [rows] = await db.execute('SELECT part_id FROM qc_marking WHERE id = ?', [id]);
        if (rows.length === 0) throw new QcError('Not found', HTTP_NOT_FOUND);
        return rows[0].part_id;
    }

    router.get('/parts/:id', read, handle(async (req) => {
        const partId = Number(req.params.id);
        const { markings, pings } = await leemacMarkings.listForAdmin(db, partId);
        const photos = await qcPhotos.listForAdmin(db, partId);
        const [jobs] = await db.execute(
            `SELECT j.id, j.job_number, j.company_id, j.created_at FROM job j
             WHERE j.id IN (SELECT job_id FROM job_part WHERE part_id = ?)
             ORDER BY j.created_at DESC, j.id DESC`,
            [partId]
        );
        return { body: { markings, pings, photos, jobs } };
    }));
    router.post('/parts/:id/markings', write, handle(async (req) => {
        const created = await leemacMarkings.createLeemacMarking(db, req.user, Number(req.params.id), req.body || {});
        return { status: HTTP_CREATED, body: { id: created.id } };
    }));
    router.delete('/parts/:id/markings', write, handle(async (req) => {
        await leemacMarkings.clearLeemacMarkings(db, Number(req.params.id));
        return { body: OK };
    }));
    router.put('/markings/:id', write, handle(async (req) => {
        const id = Number(req.params.id);
        await leemacMarkings.updateLeemacMarking(db, await markingPartId(id), id, req.body || {});
        return { body: OK };
    }));
    router.delete('/markings/:id', write, handle(async (req) => {
        const id = Number(req.params.id);
        await leemacMarkings.deleteLeemacMarking(db, await markingPartId(id), id);
        return { body: OK };
    }));
    router.post('/markings/:id/photos', write, receivePhoto, handle(async (req) => {
        const { job_id: jobId, value, caption } = req.body || {};
        const created = await qcPhotos.addPhoto(db, req.user, Number(req.params.id), {
            job_id: Number(jobId), value, caption, file: req.file,
        });
        return { status: HTTP_CREATED, body: { id: created.id } };
    }));
    router.put('/markings/:id/photos/order', write, handle(async (req) => {
        await qcPhotos.reorderPhotos(db, Number(req.params.id), (req.body || {}).ids);
        return { body: OK };
    }));
    router.put('/photos/:id', write, handle(async (req) => {
        await qcPhotos.updatePhoto(db, Number(req.params.id), req.body || {});
        return { body: OK };
    }));
    router.delete('/photos/:id', write, handle(async (req) => {
        await qcPhotos.deletePhoto(db, Number(req.params.id));
        return { body: OK };
    }));
    router.get('/photos/:id', read, handle(async (req, res) => {
        const [rows] = await db.execute('SELECT mimetype, content FROM qc_photo WHERE id = ?', [Number(req.params.id)]);
        if (rows.length === 0) throw new QcError('Not found', HTTP_NOT_FOUND);
        // setHeader keeps the stored mimetype exact; res.set would append a charset.
        res.setHeader('Content-Type', rows[0].mimetype);
        return { send: () => res.end(rows[0].content) };
    }));
    router.get('/requests', read, handle(async () => ({ body: await qcRequests.listRequests(db) })));
    router.put('/requests/:id/dismiss', write, handle(async (req) => {
        await qcRequests.dismiss(db, Number(req.params.id));
        return { body: OK };
    }));

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json(NOT_FOUND));

    return router;
}

module.exports = createQcAdminRouter();
module.exports.createQcAdminRouter = createQcAdminRouter;
