const test = require('node:test');
const assert = require('node:assert/strict');
const { createPdfRenderer } = require('../../src/lib/pdfRenderer');

const render = async (html, size) => {
    const opts = [];
    const browser = {
        connected: true,
        newPage: async () => ({
            setContent: async () => {},
            pdf: async (o) => { opts.push(o); return Uint8Array.from([1]); },
            close: async () => {},
        }),
    };
    await createPdfRenderer({ launch: async () => browser }).renderPdf(html, size && { size });
    return opts[0];
};

const letter = { format: 'Letter', printBackground: true, preferCSSPageSize: true };

test('doc-footer meta adds header/footer options with the text inserted as is', async () => {
    const o = await render('<head><meta name="doc-footer" content="Leemac &amp; Co &middot; Quote 12"></head>');
    assert.equal(o.displayHeaderFooter, true);
    assert.equal(o.headerTemplate, '<span></span>');
    assert.match(o.footerTemplate, /<span>Leemac &amp; Co &middot; Quote 12<\/span>/);
    assert.match(o.footerTemplate, /class="pageNumber"/);
    assert.match(o.footerTemplate, /class="totalPages"/);
    assert.equal(o.format, 'Letter');
    assert.equal(o.printBackground, true);
});

test('footer options keep the requested size', async () => {
    const o = await render('<meta name="doc-footer" content="x">', '4x6');
    assert.equal(o.width, '4in');
    assert.equal(o.displayHeaderFooter, true);
});

test('html without the meta gets exactly the current options', async () => {
    assert.deepEqual(await render('<p>hi</p>'), letter);
});

test('empty doc-footer content gets exactly the current options', async () => {
    assert.deepEqual(await render('<meta name="doc-footer" content="">'), letter);
});
