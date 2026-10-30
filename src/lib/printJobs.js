const { EventEmitter } = require('node:events');
const { pickPrinter, lpOptions } = require('./printers');

const events = new EventEmitter();
const DEFAULT_RECENT_LIMIT = 50;

function fail(code, message) {
    return Object.assign(new Error(message), { code });
}

function isPdf(file) {
    return file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.filename);
}

async function enqueuePrint(db, { fileId, kind, user, printerId }) {
    const [files] = await db.execute('SELECT id, filename, mimetype FROM uploaded_files WHERE id = ?', [fileId]);
    if (!files.length) throw fail('NOT_FOUND', 'file not found');
    if (!isPdf(files[0])) throw fail('NOT_PDF', 'only PDFs can be printed');
    let printer;
    if (printerId) {
        [[printer]] = await db.execute('SELECT * FROM printer WHERE id = ?', [printerId]);
        if (!printer) throw fail('NOT_FOUND', 'printer not found');
    } else {
        printer = await pickPrinter(db, kind);
    }
    const { copies, options } = lpOptions(printer, kind);
    const [result] = await db.execute(
        `INSERT INTO print_job (file_id, printer_id, kind, copies, options, requested_by_id, requested_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [fileId, printer.id, kind, copies, JSON.stringify(options), user.id, user.name]
    );
    events.emit('job', result.insertId);
    return result.insertId;
}

async function claimNext(db) {
    await db.execute(
        `UPDATE print_job SET status = 'expired', finished_at = NOW()
         WHERE status = 'queued' AND created_at < NOW() - INTERVAL 72 HOUR`
    );
    await db.execute(
        `UPDATE print_job SET status = 'failed', error = 'lease expired', finished_at = NOW()
         WHERE status = 'sent' AND claimed_at < NOW() - INTERVAL 5 MINUTE AND attempts >= 3`
    );
    await db.execute(
        `UPDATE print_job SET status = 'queued'
         WHERE status = 'sent' AND claimed_at < NOW() - INTERVAL 5 MINUTE AND attempts < 3`
    );
    const [next] = await db.execute(
        "SELECT id FROM print_job WHERE status = 'queued' ORDER BY created_at, id LIMIT 1"
    );
    if (!next.length) return null;
    const [claim] = await db.execute(
        "UPDATE print_job SET status = 'sent', claimed_at = NOW(), attempts = attempts + 1 WHERE id = ? AND status = 'queued'",
        [next[0].id]
    );
    if (!claim.affectedRows) return null;
    const [rows] = await db.execute(
        `SELECT j.id, j.file_id, j.kind, j.copies, j.options, p.cups_queue, f.filename
         FROM print_job j JOIN printer p ON p.id = j.printer_id JOIN uploaded_files f ON f.id = j.file_id
         WHERE j.id = ?`,
        [next[0].id]
    );
    return rows[0];
}

function waitForJob(ms) {
    return new Promise((resolve) => {
        const onJob = () => { clearTimeout(timer); resolve(true); };
        const timer = setTimeout(() => { events.off('job', onJob); resolve(false); }, ms);
        events.once('job', onJob);
    });
}

async function recordResult(db, id, { ok, lpJobId = null, error = null }) {
    const [result] = await db.execute(
        "UPDATE print_job SET status = ?, lp_job_id = ?, error = ?, finished_at = NOW() WHERE id = ? AND status = 'sent'",
        [ok ? 'printed' : 'failed', lpJobId, error, id]
    );
    return result.affectedRows > 0;
}

async function recentJobs(db, limit) {
    const n = Number.isInteger(Number(limit)) && Number(limit) > 0 ? Number(limit) : DEFAULT_RECENT_LIMIT;
    const [rows] = await db.execute(
        `SELECT j.*, p.name AS printer_name, f.filename
         FROM print_job j JOIN printer p ON p.id = j.printer_id JOIN uploaded_files f ON f.id = j.file_id
         ORDER BY j.id DESC LIMIT ${n}`
    );
    return rows;
}

module.exports = { events, enqueuePrint, claimNext, waitForJob, recordResult, recentJobs };
