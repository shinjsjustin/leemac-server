// Renders every v1/*.html to pdf/*.pdf with headless Chrome, the same way the server would.
// Usage: node render.js   (puppeteer is borrowed from ~/leemac-server)
const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require(path.join(os.homedir(), 'leemac-server/node_modules/puppeteer'));

const SRC = path.join(__dirname, 'v1');
const OUT = path.join(__dirname, 'pdf');

// Page numbers live in Chrome's footer band, inside the 0.6in bottom margin of docs.css.
const footer = (text) => `<div style="width:100%;margin:0 0.5in;display:flex;justify-content:space-between;
font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:7.5pt;color:#555;">
<span>${text}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

const main = async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        for (const name of fs.readdirSync(SRC).filter((f) => f.endsWith('.html'))) {
            await page.goto(`file://${path.join(SRC, name)}`, { waitUntil: 'networkidle0' });
            const isLabel = await page.$eval('body', (b) => b.classList.contains('label-doc'));
            const text = await page.$eval('meta[name="doc-footer"]', (m) => m.content);
            const out = path.join(OUT, name.replace(/\.html$/, '.pdf'));
            await page.pdf({
                path: out,
                preferCSSPageSize: true,
                printBackground: true,
                displayHeaderFooter: !isLabel,
                headerTemplate: '<span></span>',
                footerTemplate: isLabel ? '<span></span>' : footer(text),
            });
            console.log(out);
        }
    } finally {
        await browser.close();
    }
};

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
