const { test } = require('node:test');
const assert = require('node:assert');
const { notifyQuoteRequest } = require('../../src/lib/quoteRequestMail');

const REQUEST = {
    id: 12, name: 'Brackets', client_name: 'Pat', need_by: '2026-12-01',
    lines: [{ part_number: 'A', quantity: 2 }, { description: 'B', quantity: 5 }],
};

function run(overrides = {}) {
    const sent = [];
    const send = async (m) => { sent.push(m); };
    return notifyQuoteRequest({ send, to: 'j@x.com', request: REQUEST, appUrl: 'https://app.test', ...overrides })
        .then(() => sent);
}

test('sends to the recipient with subject, line count, need-by and admin link', async () => {
    const [mail, ...rest] = await run();
    assert.strictEqual(rest.length, 0);
    assert.strictEqual(mail.to, 'j@x.com');
    assert.strictEqual(mail.subject, 'Quote request: Brackets from Pat');
    assert.match(mail.text, /Lines: 2/);
    assert.match(mail.text, /Need by: 2026-12-01/);
    assert.match(mail.text, /https:\/\/app\.test\/quote-requests\/12/);
});

test('subject uses #id when unnamed and text says none without need-by', async () => {
    const [mail] = await run({ request: { ...REQUEST, name: null, need_by: null } });
    assert.strictEqual(mail.subject, 'Quote request: #12 from Pat');
    assert.match(mail.text, /Need by: none/);
});

test('the email text never contains a price', async () => {
    const [mail] = await run({ request: { ...REQUEST, lines: [{ part_number: 'A', quantity: 1, price: 99.5, unit_price: 3 }] } });
    assert.doesNotMatch(mail.subject + mail.text, /price|\$|99\.5/i);
});

test('appUrl defaults to CLIENT_URL then localhost', async () => {
    const saved = process.env.CLIENT_URL;
    try {
        delete process.env.CLIENT_URL;
        assert.match((await run({ appUrl: undefined }))[0].text, /http:\/\/localhost:3000\/quote-requests\/12/);
        process.env.CLIENT_URL = 'https://c.test';
        assert.match((await run({ appUrl: undefined }))[0].text, /https:\/\/c\.test\/quote-requests\/12/);
    } finally {
        if (saved === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = saved;
    }
});

test('with no recipient nothing is sent', async () => {
    assert.deepStrictEqual(await run({ to: undefined }), []);
    assert.deepStrictEqual(await run({ to: '' }), []);
});
