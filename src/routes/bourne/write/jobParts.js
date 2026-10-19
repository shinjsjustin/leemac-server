const { JobPartError, addPartToJob, updateJobPart, removeJobPart } = require('../../../lib/jobParts');
const { JobStarError, starJobPart, unstarJobPart } = require('../../../lib/jobStars');
const { DetailsError, updateJobDetails, updatePartDetails } = require('../../../lib/jobDetails');
const { JobNoteError, addBourneNote } = require('../../../lib/jobNotes');

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_SERVER_ERROR = 500;

const LIB_ERRORS = [JobPartError, JobStarError, DetailsError, JobNoteError];

function requireJobPartId(req, res, next) {
    if (/^\d+$/.test(req.params.jobPartId)) return next();
    res.status(HTTP_BAD_REQUEST).json({ error: 'Invalid job part id' });
}

// Runs action(req) and sends its result, mapping lib errors to their status.
function handle(failure, action, successStatus = HTTP_OK) {
    return async (req, res) => {
        try {
            const { status = successStatus, body } = await action(req);
            res.status(status).json(body);
        } catch (e) {
            if (LIB_ERRORS.some((E) => e instanceof E)) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: failure });
        }
    };
}

function registerJobPartRoutes(router, { db, requireJob, requirePart }) {
    const jobPart = '/jobs/:id/parts/:jobPartId';

    router.post('/jobs/:id/parts', requireJob, handle('Failed to add part', async (req) => ({
        status: HTTP_CREATED,
        body: await addPartToJob(db, req.params.id, req.body),
    })));

    router.post(jobPart, requireJob, requireJobPartId, handle('Failed to update part', async (req) => {
        await updateJobPart(db, req.params.id, req.params.jobPartId, req.body);
        return { body: { id: req.params.jobPartId } };
    }));

    router.post(`${jobPart}/remove`, requireJob, requireJobPartId, handle('Failed to remove part', async (req) => {
        await removeJobPart(db, req.params.id, req.params.jobPartId);
        return { body: { id: req.params.jobPartId } };
    }));

    router.post(`${jobPart}/star`, requireJob, requireJobPartId, handle('Failed to star part', async (req) => {
        const body = await starJobPart(db, req.params.id, req.params.jobPartId, req.body);
        return { status: body.created ? HTTP_CREATED : HTTP_OK, body };
    }));

    router.post(`${jobPart}/unstar`, requireJob, requireJobPartId, handle('Failed to unstar part', async (req) => ({
        body: await unstarJobPart(db, req.params.id, req.params.jobPartId),
    })));

    router.post('/jobs/:id/details', requireJob, handle('Failed to update job', async (req) => {
        await updateJobDetails(db, req.params.id, req.body || {});
        return { body: { id: req.params.id } };
    }));

    router.post('/jobs/:id/notes', requireJob, handle('Failed to add note', async (req) => ({
        status: HTTP_CREATED,
        body: await addBourneNote(db, req.params.id, (req.body || {}).content),
    })));

    router.post('/parts/:id/details', requirePart, handle('Failed to update part', async (req) => ({
        body: await updatePartDetails(db, req.params.id, req.body || {}),
    })));
}

module.exports = { registerJobPartRoutes };
