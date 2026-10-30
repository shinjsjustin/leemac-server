// Puppeteer is required only inside the default launch so this module loads
// (and the server boots) without it installed.
const DEFAULT_LAUNCH_OPTIONS = { headless: true, args: ['--no-sandbox'] };

const PDF_OPTIONS = { printBackground: true, preferCSSPageSize: true };
const PAGE_SIZES = {
    '4x6': { width: '4in', height: '6in' },
    letter: { format: 'Letter' },
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
            const pdf = await page.pdf({ ...(PAGE_SIZES[size] || PAGE_SIZES.letter), ...PDF_OPTIONS });
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
