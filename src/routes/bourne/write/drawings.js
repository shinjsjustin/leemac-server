const { jobFileUpload } = require('../../../lib/jobFiles');
const { JobPartError } = require('../../../lib/jobParts');
const { addDrawingPartToJob } = require('../../../lib/jobDrawings');

const HTTP_CREATED = 201;
const HTTP_SERVER_ERROR = 500;

const drawingFields = jobFileUpload.fields([
    { name: 'drawing', maxCount: 1 },
    { name: 'step', maxCount: 1 },
]);

function registerDrawingRoutes(router, { db, requireJob, receive }) {
    router.post('/jobs/:id/drawings', requireJob, receive(drawingFields), async (req, res) => {
        try {
            res.status(HTTP_CREATED).json(await addDrawingPartToJob(db, req.params.id, req.body, req.files));
        } catch (e) {
            if (e instanceof JobPartError) return res.status(e.status).json({ error: e.message });
            console.error(e);
            res.status(HTTP_SERVER_ERROR).json({ error: 'Failed to add drawing' });
        }
    });
}

module.exports = { registerDrawingRoutes };
