const express = require('express');
const path = require('path');
const { readOnly } = require('../../lib/bourne/readOnlyDb');
const { starredHandler } = require('./starred');
const { jobsHandler } = require('./jobs');
const { jobDetailHandler } = require('./jobDetail');
const { partsHandler, partDetailHandler } = require('./parts');
const { fileHandler } = require('./files');
const { jobEmailsHandler, partEmailsHandler } = require('./emails');
const { financesHandler, periodDetailHandler } = require('./finances');
const { isBourne, bourneLimiter } = require('../../middleware/isBourne');

const DOCS_PATH = path.join(__dirname, '../../../docs/bourne-api.md');

function createBourneRouter({ db = require('../../db/db') } = {}) {
    const router = express.Router();
    // Handlers added later read from the guarded, SELECT-only handle.
    router.locals = { db: readOnly(db) };

    router.use(bourneLimiter, isBourne);

    router.get('/docs', (req, res) => {
        res.type('text/markdown').sendFile(DOCS_PATH);
    });

    router.get('/starred', starredHandler(router.locals.db));
    router.get('/jobs', jobsHandler(router.locals.db));
    router.get('/jobs/:id', jobDetailHandler(router.locals.db));
    router.get('/parts', partsHandler(router.locals.db));
    router.get('/parts/:id', partDetailHandler(router.locals.db));
    router.get('/files/:id', fileHandler(router.locals.db));
    router.get('/jobs/:id/emails', jobEmailsHandler(router.locals.db));
    router.get('/parts/:id/emails', partEmailsHandler(router.locals.db));

    router.get('/finances', financesHandler(router.locals.db));
    router.get('/finances/periods/:id', periodDetailHandler(router.locals.db));

    router.use((req, res) => {
        res.status(404).json({ error: 'Bourne endpoint not found.' });
    });

    return router;
}

module.exports = createBourneRouter();
module.exports.createBourneRouter = createBourneRouter;
