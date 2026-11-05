const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { replyFor } = require('./fixtures');

const BUILD_DIR = path.join(__dirname, '..', '..', 'src', 'client', 'build');
const FAKE_TOKEN_TTL_S = 3600;
const ADMIN_ACCESS = 3;
const LOW_ADMIN_ACCESS = { admin1: 1, admin2: 2 };
const CLIENT_COMPANY_ID = 7;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const CLAIMS = {
  admin: { id: 1, role: 'admin', access: ADMIN_ACCESS, email: 'proof@example.com' },
  admin1: { id: 3, role: 'admin', access: LOW_ADMIN_ACCESS.admin1, email: 'admin1@example.com' },
  admin2: { id: 4, role: 'admin', access: LOW_ADMIN_ACCESS.admin2, email: 'admin2@example.com' },
  client: { id: 2, role: 'client', company_id: CLIENT_COMPANY_ID, name: 'Pat Example' },
};

// jwt-decode only reads the payload, so the signature can be fake.
function fakeToken(role) {
  const exp = Math.floor(Date.now() / 1000) + FAKE_TOKEN_TTL_S;
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...CLAIMS[role], exp })}.sig`;
}

function serveBuild(req, res) {
  const requested = path.join(BUILD_DIR, path.normalize(new URL(req.url, 'http://x').pathname));
  const isFile = requested.startsWith(BUILD_DIR) && fs.existsSync(requested) && fs.statSync(requested).isFile();
  const file = isFile ? requested : path.join(BUILD_DIR, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

// Opens the built app in headless Chrome with every /api/ call answered from fixtures.
async function startHarness() {
  const server = http.createServer(serveBuild);
  const port = await listen(server);
  const browser = await puppeteer.launch({ headless: true });
  const failures = [];

  async function openPage(viewport, route, role = 'admin') {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.evaluateOnNewDocument((token) => localStorage.setItem('token', token), fakeToken(role));
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const { pathname, search } = new URL(request.url());
      if (!pathname.startsWith('/api/') || request.url().startsWith(`http://127.0.0.1:${port}`)) return request.continue();
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: CORS });
      const reply = replyFor(request.method(), pathname + search);
      if (!reply) {
        failures.push(`no fixture for ${request.method()} ${pathname}`);
        return request.respond({ status: 501, headers: CORS, contentType: 'application/json', body: '{"error":"no fixture"}' });
      }
      return request.respond({ status: reply.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(reply.body) });
    });
    await page.goto(`http://127.0.0.1:${port}${route}`, { waitUntil: 'networkidle0' });
    return page;
  }

  async function close() {
    await browser.close();
    server.close();
  }

  return { openPage, failures, close };
}

module.exports = { startHarness, fakeToken };
