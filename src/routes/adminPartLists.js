const express = require('express');
const defaultDb = require('../db/db');
const adminPartLists = require('../lib/adminPartLists');

const { AdminPartListError } = adminPartLists;

const ID_PATTERN = /^[1-9]\d{0,9}$/;
const NOT_FOUND = { error: 'Not found' };
const HTTP_NOT_FOUND = 404;
const HTTP_CREATED = 201;

function validateId(req, res, next, value) {
    if (!ID_PATTERN.test(value)) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
    next();
}

// Wraps a handler: a null result is 404, AdminPartListError keeps its status, anything else is a generic 500.
function handle(run) {
    return async (req, res) => {
        try {
            const result = await run(req, res);
            if (result === null) return res.status(HTTP_NOT_FOUND).json(NOT_FOUND);
            res.status(result.status || 200).json(result.body);
        } catch (error) {
            if (error instanceof AdminPartListError) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error('Admin part lists error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    };
}

const ok = (body) => (body === null ? null : { body });

function createAdminPartListsRouter({ db = defaultDb } = {}) {
    const router = express.Router();

    router.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });

    router.param('id', validateId);

    const user = (req) => req.user;
    const listId = (req) => Number(req.params.id);

    router.get('/', handle(async (req) => ok(await adminPartLists.listLists(db, user(req)))));
    router.post('/', handle(async (req) => {
        const created = await adminPartLists.createList(db, user(req), req.body);
        return { status: HTTP_CREATED, body: { id: created.id } };
    }));
    router.put('/:id', handle(async (req) => ok(await adminPartLists.renameList(db, user(req), listId(req), req.body))));
    router.delete('/:id', handle(async (req) => {
        const removed = await adminPartLists.deleteList(db, user(req), listId(req));
        return removed === null ? null : { body: { ok: true } };
    }));
    router.post('/:id/parts', handle(async (req) => ok(await adminPartLists.addParts(db, user(req), listId(req), req.body))));
    router.post('/:id/parts/remove', handle(async (req) => ok(await adminPartLists.removeParts(db, user(req), listId(req), req.body))));

    router.use((req, res) => res.status(HTTP_NOT_FOUND).json(NOT_FOUND));

    return router;
}

module.exports = createAdminPartListsRouter();
module.exports.createAdminPartListsRouter = createAdminPartListsRouter;
