// Puppeteer is required only inside the default launch so this module loads
// (and the server boots) without it installed.
const DEFAULT_LAUNCH_OPTIONS = { headless: true, args: ['--no-sandbox'] };

const PDF_OPTIONS = { printBackground: true, preferCSSPageSize: true };
const PAGE_SIZES = {
    '4x6': { width: '4in', height: '6in' },
    letter: { format: 'Letter' },
};

const DOC_FOOTER_META = /<meta\s+name="doc-footer"\s+content="([^"]*)"/;

// Page numbers live in Chrome's footer band, inside the bottom margin of the page CSS.
// The text is already HTML-escaped inside the meta, so it is inserted as is.
const footerOptions = (html) => {
    const text = (DOC_FOOTER_META.exec(html) || [])[1];
    if (!text) return {};
    return {
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;margin:0 0.5in;display:flex;justify-content:space-between;
font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:7.5pt;color:#555;">
<span>${text}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    };
};

const defaultLaunch = async (options) => {
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (err) {
        if (err.code !== 'MODULE_NOT_FOUND') throw err;
        const unavailable = new Error('PDF renderer unavailable: run npm install puppeteer');
        unavailable.code = 'RENDERER_UNAVAILABLE';
        throw unavailable;
    }
    return puppeteer.launch(options);
};

const createPdfRenderer = ({ launch = defaultLaunch, launchOptions = DEFAULT_LAUNCH_OPTIONS } = {}) => {
    let browser = null;
    let queue = Promise.resolve();

    const getBrowser = async () => {
        if (!browser || !browser.connected) browser = await launch(launchOptions);
        return browser;
    };

    const renderNow = async (html, size) => {
        const page = await (await getBrowser()).newPage();
        try {
            await page.setContent(html, { waitUntil: 'load' });
            const pdf = await page.pdf({ ...(PAGE_SIZES[size] || PAGE_SIZES.letter), ...PDF_OPTIONS, ...footerOptions(html) });
            return Buffer.from(pdf);
        } finally {
            await page.close();
        }
    };

    const renderPdf = (html, { size = 'letter' } = {}) => {
        const result = queue.then(() => renderNow(html, size));
        queue = result.catch(() => {});
        return result;
    };

    const close = async () => {
        const current = browser;
        browser = null;
        if (current) await current.close();
    };

    return { renderPdf, close };
};

let shared = null;
const defaultRenderer = () => {
    if (!shared) shared = createPdfRenderer();
    return shared;
};

module.exports = { createPdfRenderer, defaultRenderer };
