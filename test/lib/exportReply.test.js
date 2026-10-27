const test = require('node:test');
const assert = require('node:assert');
const { parseExportReply, ExportReplyError } = require('../../src/lib/exportReply');

const pdfBytes = Buffer.from('%PDF-1.4 hello');
const reply = (obj) => ({ text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const good = { ok: true, jobNumber: 1234, pdfBase64: pdfBytes.toString('base64') };

const rejects = (promise, status, pattern) =>
    assert.rejects(promise, (err) => {
        assert.ok(err instanceof ExportReplyError);
        assert.strictEqual(err.status, status);
        assert.match(err.message, pattern);
        return true;
    });

test('legacy reply when response has no text()', async () => {
    assert.deepStrictEqual(await parseExportReply({}, { jobNumber: 1 }), { pdf: null, legacy: true });
});

test('legacy reply when body is not JSON', async () => {
    assert.deepStrictEqual(await parseExportReply(reply('<html>ok</html>'), { jobNumber: 1 }), { pdf: null, legacy: true });
});

test('legacy reply when JSON has no pdfBase64', async () => {
    assert.deepStrictEqual(await parseExportReply(reply({ ok: true }), { jobNumber: 1 }), { pdf: null, legacy: true });
});

test('returns decoded PDF when job number matches as number vs string', async () => {
    const out = await parseExportReply(reply(good), { jobNumber: ' 1234 ' });
    assert.strictEqual(out.legacy, false);
    assert.ok(out.pdf.equals(pdfBytes));
});

test('409 naming both numbers on mismatch', async () => {
    await rejects(parseExportReply(reply(good), { jobNumber: 99 }), 409, /job 1234, not job 99; not saved/);
});

test('502 when pdfBase64 has no jobNumber', async () => {
    await rejects(parseExportReply(reply({ ok: true, pdfBase64: good.pdfBase64 }), { jobNumber: 1 }), 502, /no job number/);
});

test('502 with script error when ok is false', async () => {
    await rejects(parseExportReply(reply({ ...good, ok: false, error: 'boom' }), { jobNumber: 1234 }), 502, /Export script error: boom/);
});

test('502 when bytes are not a PDF', async () => {
    const bad = { ...good, pdfBase64: Buffer.from('hello').toString('base64') };
    await rejects(parseExportReply(reply(bad), { jobNumber: 1234 }), 502, /not a PDF/);
});

test('502 when decoded PDF is empty', async () => {
    await rejects(parseExportReply(reply({ ...good, pdfBase64: '' }), { jobNumber: 1234 }), 502, /empty|not a PDF/);
});

test('502 when PDF exceeds maxBytes, ok at exactly maxBytes', async () => {
    await rejects(parseExportReply(reply(good), { jobNumber: 1234, maxBytes: pdfBytes.length - 1 }), 502, /too large/);
    const out = await parseExportReply(reply(good), { jobNumber: 1234, maxBytes: pdfBytes.length });
    assert.ok(out.pdf.equals(pdfBytes));
});

test('502 script error when ok is false and there is no pdfBase64', async () => {
    await rejects(parseExportReply(reply({ ok: false, error: 'boom' }), { jobNumber: 1 }), 502, /^Export script error: boom$/);
});
