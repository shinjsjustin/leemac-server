const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const { runOnce } = require('../../tools/print-agent/agent');

const BASE = 'http://shop.test';
const JOB = { id: 7, file_url: '/api/print-agent/jobs/7/file', cups_queue: 'Brother_HL', copies: 2, options: ['media=Letter', 'fit-to-page'] };

function setup({ job = JOB, lpResult = { stdout: 'request id is Brother_HL-12 (1 file(s))\n' }, lpError = null } = {}) {
    const calls = { fetch: [], lp: null, tempExistedDuringLp: false };
    const fetch = async (url, init = {}) => {
        calls.fetch.push({ url, init });
        if (url.startsWith(`${BASE}/api/print-agent/next`)) {
            return job ? { status: 200, ok: true, json: async () => ({ job }) } : { status: 204, ok: true };
        }
        if (url.endsWith('/file')) return { status: 200, ok: true, arrayBuffer: async () => new TextEncoder().encode('%PDF-1').buffer };
        return { status: 200, ok: true, json: async () => ({ ok: true }) };
    };
    const execFile = async (cmd, args) => {
        calls.lp = { cmd, args };
        calls.tempExistedDuringLp = fs.existsSync(args[args.length - 1]);
        if (lpError) throw lpError;
        return lpResult;
    };
    return { calls, deps: { fetch, execFile, baseUrl: BASE, token: 'tok', wait: 25 } };
}

const resultCall = (calls) => calls.fetch.find((c) => c.url.endsWith('/result'));

test('returns without printing on 204', async () => {
    const { calls, deps } = setup({ job: null });
    await runOnce(deps);
    assert.strictEqual(calls.fetch.length, 1);
    assert.strictEqual(calls.fetch[0].url, `${BASE}/api/print-agent/next?wait=25`);
    assert.strictEqual(calls.fetch[0].init.headers.Authorization, 'Bearer tok');
    assert.strictEqual(calls.lp, null);
});

test('prints a claimed job with lp and reports printed with the lp id', async () => {
    const { calls, deps } = setup();
    await runOnce(deps);
    const { cmd, args } = calls.lp;
    assert.strictEqual(cmd, 'lp');
    assert.deepStrictEqual(args.slice(0, -1), ['-d', 'Brother_HL', '-n', '2', '-o', 'media=Letter', '-o', 'fit-to-page']);
    assert.ok(args[args.length - 1].endsWith('.pdf'));
    assert.ok(calls.tempExistedDuringLp);
    assert.ok(!fs.existsSync(args[args.length - 1]));
    const r = resultCall(calls);
    assert.strictEqual(r.url, `${BASE}/api/print-agent/jobs/7/result`);
    assert.strictEqual(r.init.method, 'POST');
    assert.strictEqual(r.init.headers.Authorization, 'Bearer tok');
    assert.deepStrictEqual(JSON.parse(r.init.body), { status: 'printed', lp_job_id: 'Brother_HL-12' });
});

test('reports failed with the error and deletes the file when lp fails', async () => {
    const { calls, deps } = setup({ lpError: new Error('lp: boom') });
    await runOnce(deps);
    const body = JSON.parse(resultCall(calls).init.body);
    assert.strictEqual(body.status, 'failed');
    assert.match(body.error, /boom/);
    assert.ok(!fs.existsSync(calls.lp.args[calls.lp.args.length - 1]));
});

test('refuses queue and options that fail the allow-list without running lp', async () => {
    for (const bad of [
        { ...JOB, cups_queue: 'a; rm -rf /' },
        { ...JOB, options: ['media=Letter value'] },
        { ...JOB, options: ['$(id)'] },
    ]) {
        const { calls, deps } = setup({ job: bad });
        await runOnce(deps);
        assert.strictEqual(calls.lp, null);
        assert.strictEqual(JSON.parse(resultCall(calls).init.body).status, 'failed');
    }
});
