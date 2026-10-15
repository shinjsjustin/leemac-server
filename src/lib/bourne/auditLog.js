const MAX_SUMMARY_LENGTH = 4000;
const ERROR_STATUS = 400;

function buildSummary(req) {
    const summary = { ...req.body };
    if (req.files?.length) {
        summary.files = req.files.map(({ originalname, mimetype, size }) => ({
            filename: originalname,
            mimetype,
            size,
        }));
    }
    return JSON.stringify(summary).slice(0, MAX_SUMMARY_LENGTH);
}

function auditWrites(db) {
    return (req, res, next) => {
        res.on('finish', async () => {
            try {
                const accepted = Boolean(req.bourneActor) && res.statusCode < ERROR_STATUS;
                await db.execute(
                    `INSERT INTO bourne_write_log
                        (actor, method, path, status, accepted, ip, request_summary)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [req.bourneActor ?? null, req.method, req.originalUrl, res.statusCode,
                        accepted ? 1 : 0, req.ip, buildSummary(req)]
                );
            } catch (err) {
                console.error('Bourne write audit insert failed:', err.message);
            }
        });
        next();
    };
}

module.exports = { auditWrites };
