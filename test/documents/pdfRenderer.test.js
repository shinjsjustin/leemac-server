const test = require('node:test');
const assert = require('node:assert/strict');

const hasPuppeteer = (() => {
    try { require.resolve('puppeteer'); return true; } catch { return false; }
})();

const fakeBrowser = ({ pdf } = {}) => {
    const browser = { connected: true, pages: [], closed: false };
    browser.newPage = async () => {
        const page = {
            closed: false,
            contents: [],
            pdfOpts: [],
            setContent: async (html, opts) => { page.contents.push([html, opts]); },
            pdf: async (opts) => {
                page.pdfOpts.push(opts);
                return pdf ? pdf(page) : Uint8Array.from([37, 80, 68, 70]);
            },
            close: async () => { page.closed = true; },
        };
        browser.pages.push(page);
        return page;
    };
    browser.close = async () => { browser.closed = true; browser.connected = false; };
    return browser;
};

test('requiring the module does not load puppeteer', () => {
    const before = Object.keys(require.cache).filter((k) => k.includes('puppeteer'));
    require('../../src/lib/pdfRenderer');
    const after = Object.keys(require.cache).filter((k) => k.includes('puppeteer'));
    assert.deepEqual(after, before);
});

test('launches lazily, once, and reuses the browser', async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    const browser = fakeBrowser();
    const calls = [];
    const r = createPdfRenderer({ launch: async (o) => { calls.push(o); return browser; }, launchOptions: { a: 1 } });
    assert.equal(calls.length, 0);
    await r.renderPdf('<p>1</p>');
    await r.renderPdf('<p>2</p>');
    assert.deepEqual(calls, [{ a: 1 }]);
    assert.equal(browser.pages.length, 2);
});

test('relaunches after the browser disconnects', async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    const browsers = [];
    const r = createPdfRenderer({ launch: async () => { const b = fakeBrowser(); browsers.push(b); return b; } });
    await r.renderPdf('a');
    browsers[0].connected = false;
    await r.renderPdf('b');
    assert.equal(browsers.length, 2);
    assert.equal(browsers[1].pages.length, 1);
});

test('renders one at a time and a failure does not block the next', async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    let active = 0;
    let maxActive = 0;
    let n = 0;
    const browser = fakeBrowser({
        pdf: async () => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((res) => setTimeout(res, 10));
            active -= 1;
            n += 1;
            if (n === 1) throw new Error('boom');
            return Uint8Array.from([1]);
        },
    });
    const r = createPdfRenderer({ launch: async () => browser });
    const results = await Promise.allSettled([r.renderPdf('a'), r.renderPdf('b'), r.renderPdf('c')]);
    assert.equal(maxActive, 1);
    assert.deepEqual(results.map((x) => x.status), ['rejected', 'fulfilled', 'fulfilled']);
    assert.equal(results[0].reason.message, 'boom');
    assert.ok(browser.pages.every((p) => p.closed));
});

test('closes the page when pdf throws', async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    const browser = fakeBrowser({ pdf: async () => { throw new Error('bad'); } });
    const r = createPdfRenderer({ launch: async () => browser });
    await assert.rejects(r.renderPdf('x'), /bad/);
    assert.equal(browser.pages[0].closed, true);
});

test('returns a Buffer and sets content with waitUntil load', async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    const browser = fakeBrowser();
    const r = createPdfRenderer({ launch: async () => browser });
    const out = await r.renderPdf('<b>hi</b>');
    assert.ok(Buffer.isBuffer(out));
    assert.deepEqual([...out], [37, 80, 68, 70]);
    assert.deepEqual(browser.pages[0].contents, [['<b>hi</b>', { waitUntil: 'load' }]]);
});

test('size 4x6 passes width 4in and height 6in', async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    const browser = fakeBrowser();
    const r = createPdfRenderer({ launch: async () => browser });
    await r.renderPdf('x', { size: '4x6' });
    assert.deepEqual(browser.pages[0].pdfOpts[0], {
        width: '4in', height: '6in', printBackground: true, preferCSSPageSize: true,
    });
});

test('size letter (and default) passes format Letter', async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    const browser = fakeBrowser();
    const r = createPdfRenderer({ launch: async () => browser });
    await r.renderPdf('x', { size: 'letter' });
    await r.renderPdf('x');
    const expected = { format: 'Letter', printBackground: true, preferCSSPageSize: true };
    assert.deepEqual(browser.pages[0].pdfOpts[0], expected);
    assert.deepEqual(browser.pages[1].pdfOpts[0], expected);
});

test('close closes the browser and the next render relaunches', async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    const browsers = [];
    const r = createPdfRenderer({ launch: async () => { const b = fakeBrowser(); browsers.push(b); return b; } });
    await r.renderPdf('a');
    await r.close();
    assert.equal(browsers[0].closed, true);
    await r.renderPdf('b');
    assert.equal(browsers.length, 2);
});

test('default launch rejects with RENDERER_UNAVAILABLE when puppeteer is missing',
    { skip: hasPuppeteer && 'puppeteer is installed' },
    async () => {
        const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
        const r = createPdfRenderer();
        await assert.rejects(r.renderPdf('x'), (err) => {
            assert.equal(err.code, 'RENDERER_UNAVAILABLE');
            assert.match(err.message, /npm install puppeteer/);
            return true;
        });
    });

test('defaultRenderer is created on first use',
    async () => {
        const mod = require('../../src/lib/pdfRenderer');
        assert.equal(typeof mod.defaultRenderer, 'function');
        assert.equal(mod.defaultRenderer(), mod.defaultRenderer());
        assert.equal(typeof mod.defaultRenderer().renderPdf, 'function');
    });

test('real render produces a PDF', { skip: !hasPuppeteer && 'puppeteer not installed' }, async () => {
    const { createPdfRenderer } = require('../../src/lib/pdfRenderer');
    const r = createPdfRenderer();
    try {
        const out = await r.renderPdf('<h1>Hi</h1>');
        assert.equal(out.subarray(0, 4).toString(), '%PDF');
    } finally {
        await r.close();
    }
});
