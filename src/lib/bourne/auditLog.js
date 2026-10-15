const MAX_SUMMARY_LENGTH = 4000;
const ERROR_STATUS = 400;

const MAX_SUMMARY_KEYS = 50;

// Slicing the JSON string would leave it unparseable for the JSON column, so
// an oversized summary is a small wrapper around a shortened preview instead.
function truncateSummary(full, summary, files) {
    const wrap = (preview) => JSON.stringify({
        truncated: true,
        length: full.length,
        keys: Object.keys(summary).filter((k) => k !== 'files').slice(0, MAX_SUMMARY_KEYS),
        files,
        preview,
    });
    let preview = full.slice(0, MAX_SUMMARY_LENGTH);
    let result = wrap(preview);
    while (result.length > MAX_SUMMARY_LENGTH) {
        preview = preview.slice(0, Math.max(0, preview.length - (result.length - MAX_SUMMARY_LENGTH)));
        result = wrap(preview);
    }
    return result;
}

function buildSummary(req) {
    const summary = { ...req.body };
    let files;
    if (req.files?.length) {
        files = req.files.map(({ originalname, mimetype, size }) => ({
            filename: originalname,
            mimetype,
            size,
        }));
        summary.files = files;
    }
    const full = JSON.stringify(summary);
    return full.length <= MAX_SUMMARY_LENGTH ? full : truncateSummary(full, summary, files);
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
