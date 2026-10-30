const express = require('express');
const db = require('../db/db');
const { requireAdmin } = require('../middleware/requireRole');
const { listPrinters, createPrinter, updatePrinter } = require('../lib/printers');
const { enqueuePrint, recentJobs } = require('../lib/printJobs');
const { issueToken, agentStatus } = require('../lib/printAgentToken');
const { jobPrintables, printJobDrawings } = require('../lib/jobPrints');
const { testPrintPdf } = require('../lib/testPrintPdf');

const router = express.Router();

const PRINT_KINDS = ['file', 'drawing', 'quote', 'order', 'invoice', 'packing', 'shipping'];
const RECENT_JOB_LIMIT = 20;
const ID_PATTERN = /^[1-9]\d{0,9}$/;
const STATUS_BY_CODE = { INVALID: 400, NOT_PDF: 400, NOT_FOUND: 404, NO_PRINTER: 409 };

// Maps library errors to HTTP statuses; anything unrecognised is a logged 500.
function handle(run) {
    return async (req, res) => {
        try {
            await run(req, res);
        } catch (error) {
            const status = STATUS_BY_CODE[error.code];
            if (!status) {
                console.error('Printing error:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.status(status).json({ error: error.message });
        }
    };
}

async function queue(req, res, args) {
    const user = { id: req.user.id, name: req.user.name ?? req.user.email };
    const jobId = await enqueuePrint(db, { ...args, user });
    const [[job]] = await db.execute(
        'SELECT p.name AS printer, j.copies FROM print_job j JOIN printer p ON p.id = j.printer_id WHERE j.id = ?',
        [jobId]
    );
    res.status(201).json({ job_id: jobId, printer: job.printer, copies: job.copies });
}

router.post('/print', handle(async (req, res) => {
    const { file_id: fileId, kind } = req.body || {};
    if (!ID_PATTERN.test(String(fileId)) || !PRINT_KINDS.includes(kind)) {
        return res.status(400).json({ error: 'file_id and a valid kind are required' });
    }
    await queue(req, res, { fileId: Number(fileId), kind });
}));

router.get('/print/job', handle(async (req, res) => {
    if (!ID_PATTERN.test(String(req.query.id))) return res.status(400).json({ error: 'a valid id is required' });
    res.json(await jobPrintables(db, Number(req.query.id)));
}));

router.post('/print/job/drawings', handle(async (req, res) => {
    const jobId = (req.body || {}).job_id;
    if (!ID_PATTERN.test(String(jobId))) return res.status(400).json({ error: 'a valid job_id is required' });
    const user = { id: req.user.id, name: req.user.name ?? req.user.email };
    res.status(201).json(await printJobDrawings(db, Number(jobId), user));
}));

router.get('/printers', handle(async (req, res) => {
    const [printers, agent, jobs] = await Promise.all([listPrinters(db), agentStatus(db), recentJobs(db, RECENT_JOB_LIMIT)]);
    res.json({ printers, agent: { last_seen_at: agent.lastSeenAt }, jobs });
}));

router.post('/printers', requireAdmin(3), handle(async (req, res) => {
    res.status(201).json({ id: await createPrinter(db, req.body || {}) });
}));

router.post('/printers/agent-token', requireAdmin(3), handle(async (req, res) => {
    res.status(201).json({ token: await issueToken(db) });
}));

router.put('/printers/:id', requireAdmin(3), handle(async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'printer not found' });
    await updatePrinter(db, Number(req.params.id), req.body || {});
    res.json({ ok: true });
}));

router.post('/printers/:id/test', handle(async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'printer not found' });
    const printerId = Number(req.params.id);
    const [[printer]] = await db.execute('SELECT * FROM printer WHERE id = ?', [printerId]);
    if (!printer) return res.status(404).json({ error: 'printer not found' });
    const pdf = testPrintPdf(printer.name, new Date());
    const [upload] = await db.execute(
        'INSERT INTO uploaded_files (filename, mimetype, size, content) VALUES (?,?,?,?)',
        ['test-print.pdf', 'application/pdf', pdf.length, pdf]
    );
    await queue(req, res, { fileId: upload.insertId, kind: 'file', printerId });
}));

module.exports = router;
