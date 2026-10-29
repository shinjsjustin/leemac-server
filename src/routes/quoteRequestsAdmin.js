const express = require('express');
const defaultDb = require('../db/db');
const review = require('../lib/quoteRequestReview');
const jobLib = require('../lib/quoteRequestJob');
const { QuoteRequestError } = require('../lib/quoteRequests');

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const STATUSES = ['sent', 'in_review', 'job_created'];
const NOT_FOUND = { error: 'Not found' };
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CREATED = 201;
const DEFAULT_MIMETYPE = 'application/octet-stream';
// Quotes and backslashes would break the quoted header value; control characters allow header injection.
const UNSAFE_FILENAME_CHARS = /["\\\x00-\x1f\x7f]/g;

function validateId(req, res, next, value) {
    if (!ID_PATTERN.test(value)) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
    next();
}

// A null result is 404, QuoteRequestError keeps its status, anything else is a generic 500.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req, res);
            if (result === null) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
            if (result === undefined) return;
            res.status(result.status || 200).json(result.body);
        } catch (error) {
            if (error instanceof QuoteRequestError) return res.status(error.status).json({ error: error.message });
            console.error('Quote requests admin error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

const ok = (body) => (body === null ? null : { body });

function createQuoteRequestsAdminRouter({ db = defaultDb } = {}) {
    const router = express.Router();

    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });
    router.param('id', validateId);
    router.param('fileId', validateId);
    router.param('lineId', validateId);

    router.get('/', handle(async (req) => {
        const { status } = req.query;
        if (status !== undefined && !STATUSES.includes(status)) {
            throw new QuoteRequestError('Invalid status', HTTP_BAD_REQUEST);
        }
        return ok(await review.listInbox(db, { status }));
    }));
    router.get('/:id', handle(async (req) => ok(await review.getReview(db, Number(req.params.id)))));
    router.put('/:id', handle(async (req) => ok(await review.saveReview(db, Number(req.params.id), req.body))));
    router.delete('/:id/lines/:lineId', handle(async (req) => (
        ok(await review.removeLine(db, Number(req.params.id), Number(req.params.lineId)))
    )));
    router.post('/:id/check', handle(async (req) => ok(await review.checkMatches(db, Number(req.params.id), req.body))));
    router.post('/:id/job', handle(async (req) => {
        const job = await jobLib.createJobFromRequest(db, Number(req.params.id));
        return job === null ? null : { status: HTTP_CREATED, body: { id: job.id, job_number: job.job_number } };
    }));
    router.get('/:id/files/:fileId', handle(async (req, res) => {
        const file = await review.getRequestFile(db, Number(req.params.id), Number(req.params.fileId));
        if (file === null) return null;
        const safeName = String(file.filename ?? '').replace(UNSAFE_FILENAME_CHARS, '');
        res.set({
            'Content-Type': file.mimetype || DEFAULT_MIMETYPE,
            'Content-Length': file.content.length,
            'Content-Disposition': `inline; filename="${safeName}"`,
        });
        res.end(file.content);
    }));

    return router;
}

module.exports = createQuoteRequestsAdminRouter();
module.exports.createQuoteRequestsAdminRouter = createQuoteRequestsAdminRouter;
