function auditPortal(log = (line) => console.info(line)) {
    return (req, res, next) => {
        const start = process.hrtime.bigint();
        res.on('finish', () => {
            const user = req.user || {};
            try {
                log(JSON.stringify({
                    event: 'portal_request',
                    at: new Date().toISOString(),
                    method: req.method,
                    path: req.baseUrl + req.path,
                    status: res.statusCode,
                    role: user.role ?? null,
                    user_id: user.id ?? null,
                    company_id: user.company_id ?? null,
                    ip: req.ip,
                    ms: Number(process.hrtime.bigint() - start) / 1e6,
                }));
            } catch (err) {
                console.error('portal audit log failed', err);
            }
        });
        next();
    };
}

module.exports = { auditPortal };
