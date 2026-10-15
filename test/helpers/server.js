const ENV_DEFAULTS = {
    JWT_SECRET: 'test-jwt-secret',
    CLIENT_ID: 'test-client-id',
    CLIENT_SECRET: 'test-client-secret',
    SESSION_SECRET: 'test-session-secret',
    BOURNE_READ_KEY: 'test-bourne-read-key',
};

for (const [key, value] of Object.entries(ENV_DEFAULTS)) {
    process.env[key] ??= value;
}

function start(app) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, '127.0.0.1', () => {
            resolve({
                server,
                baseUrl: `http://127.0.0.1:${server.address().port}`,
                close: () => new Promise((done) => server.close(done)),
            });
        });
        server.on('error', reject);
    });
}

module.exports = { start };
