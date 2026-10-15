const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { start } = require('./server');

test('start binds to 127.0.0.1, serves requests through baseUrl and closes', async () => {
    const app = express();
    app.get('/ping', (req, res) => res.send('pong'));

    const { server, baseUrl, close } = await start(app);
    try {
        assert.equal(server.address().address, '127.0.0.1');
        const res = await fetch(`${baseUrl}/ping`);
        assert.equal(await res.text(), 'pong');
    } finally {
        await close();
    }
    assert.equal(server.listening, false);
});
