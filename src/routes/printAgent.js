const express = require('express');
const { createIsPrintAgent, printAgentLimiter } = require('../middleware/isPrintAgent');
const { claimNext, waitForJob, recordResult } = require('../lib/printJobs');

const MAX_WAIT_SECONDS = 25;
const RESULT_STATUSES = ['printed', 'failed'];

function createPrintAgentRouter({ db }) {
    const router = express.Router();
    router.use(printAgentLimiter, createIsPrintAgent(db));

    // GET /api/print-agent/next?wait=<seconds>
    // Long-poll for the next queued job. Returns 204 when none arrives in time.
    router.get('/next', async (req, res) => {
        const wait = Math.min(Math.max(Number(req.query.wait) || 0, 0), MAX_WAIT_SECONDS);
        try {
            let job = await claimNext(db);
            if (!job && wait > 0) {
                await waitForJob(wait * 1000);
                job = await claimNext(db);
            }
            if (!job) return res.status(204).end();
            res.json({
                job: {
                    id: job.id,
                    file_url: `/api/print-agent/jobs/${job.id}/file`,
                    cups_queue: job.cups_queue,
                    copies: job.copies,
                    options: typeof job.options === 'string' ? JSON.parse(job.options) : job.options,
                },
            });
        } catch (error) {
            console.error('Error claiming print job:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // GET /api/print-agent/jobs/:id/file
    // Stream the job's PDF, only while the job is leased (status sent).
    router.get('/jobs/:id/file', async (req, res) => {
        try {
            const [rows] = await db.execute(
                `SELECT j.id, j.status, f.filename, f.mimetype, f.content
                 FROM print_job j JOIN uploaded_files f ON f.id = j.file_id WHERE j.id = ?`,
                [Number(req.params.id)]
            );
            if (!rows.length) return res.status(404).json({ error: 'Job not found' });
            if (rows[0].status !== 'sent') return res.status(409).json({ error: 'Job is not awaiting print' });
            res.setHeader('Content-Type', rows[0].mimetype);
            res.send(rows[0].content);
        } catch (error) {
            console.error('Error streaming print file:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // POST /api/print-agent/jobs/:id/result  { status: 'printed'|'failed', lp_job_id, error }
    router.post('/jobs/:id/result', async (req, res) => {
        const { status, lp_job_id, error } = req.body || {};
        if (!RESULT_STATUSES.includes(status)) {
            return res.status(400).json({ error: "status must be 'printed' or 'failed'" });
        }
        try {
            const recorded = await recordResult(db, Number(req.params.id), {
                ok: status === 'printed',
                lpJobId: lp_job_id ?? null,
                error: error ?? null,
            });
            if (!recorded) return res.status(409).json({ error: 'Job is not awaiting a result' });
            res.json({ ok: true });
        } catch (err) {
            console.error('Error recording print result:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    return router;
}

module.exports = { createPrintAgentRouter };
