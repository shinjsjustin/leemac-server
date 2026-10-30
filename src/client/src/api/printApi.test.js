import contracts from './contracts/printApi.json';
import {
  printFile, downloadFile, listPrinters, savePrinter, testPrint, issueAgentToken, jobPrintables, printJobDrawings,
} from './printApi';

const GENERIC = 'Something went wrong. Please try again.';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
  blob: async () => 'BLOB',
});

const api = { printFile, downloadFile, listPrinters, savePrinter, testPrint, issueAgentToken };

let clicked;
beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
  clicked = [];
  global.URL.createObjectURL = jest.fn(() => 'blob:x');
  global.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    clicked.push({ href: this.href, download: this.download, attached: document.body.contains(this) });
  });
});
afterEach(() => jest.restoreAllMocks());

describe('contract fixtures', () => {
  test.each(Object.entries(contracts))('%s sends its fixture', async (name, { args, method, path, body }) => {
    global.fetch.mockResolvedValue(respond(200, { a: 1 }));
    const result = await api[name](...args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(path)).toBe(true);
    expect(init.method).toBe(method);
    expect(init.body).toBe(body ? JSON.stringify(body) : undefined);
    expect(result.ok).toBe(true);
  });
});

describe('results', () => {
  test('returns the parsed body as data', async () => {
    global.fetch.mockResolvedValue(respond(201, { printer: 'Brother', copies: 2 }));
    expect(await printFile(60, 'file')).toEqual({ ok: true, data: { printer: 'Brother', copies: 2 } });
  });

  test('carries the server error text on a refusal', async () => {
    global.fetch.mockResolvedValue(respond(409, { error: 'no enabled letter printer' }));
    expect(await printFile(60, 'file')).toEqual({ ok: false, error: { message: 'no enabled letter printer' } });
  });

  test('uses a generic message when the error body is unreadable', async () => {
    global.fetch.mockResolvedValue({ ...respond(500, null), json: async () => { throw new Error('bad'); } });
    expect(await listPrinters()).toEqual({ ok: false, error: { message: GENERIC } });
  });

  test('does not throw when the network fails', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    expect(await testPrint(4)).toEqual({ ok: false, error: { message: GENERIC } });
  });
});

describe('savePrinter', () => {
  test('PUTs to the printer id without the id in the body when it has one', async () => {
    global.fetch.mockResolvedValue(respond(200, { ok: true }));
    await savePrinter({ id: 4, name: 'B' });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith('/internal/printers/4')).toBe(true);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"name":"B"}');
  });
});

describe('downloadFile', () => {
  test('saves the blob under the given filename with a temporary link', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));
    const result = await downloadFile(60, 'a.pdf');
    expect(URL.createObjectURL).toHaveBeenCalledWith('BLOB');
    expect(clicked).toEqual([{ href: 'blob:x', download: 'a.pdf', attached: true }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(result.ok).toBe(true);
  });

  test('saves nothing and reports the error when the server refuses', async () => {
    global.fetch.mockResolvedValue(respond(404, { error: 'File not found' }));
    expect(await downloadFile(60, 'a.pdf')).toEqual({ ok: false, error: { message: 'File not found' } });
    expect(clicked).toEqual([]);
  });
});

describe('job print routes', () => {
  test('jobPrintables GETs the job id as a query', async () => {
    global.fetch.mockResolvedValue(respond(200, { documents: [], drawings: 0 }));
    const result = await jobPrintables(3);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith('/internal/print/job?id=3')).toBe(true);
    expect(init.method).toBe('GET');
    expect(result.data).toEqual({ documents: [], drawings: 0 });
  });

  test('printJobDrawings POSTs job_id', async () => {
    global.fetch.mockResolvedValue(respond(201, { queued: 2, printer: 'B' }));
    await printJobDrawings(3);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith('/internal/print/job/drawings')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"job_id":3}');
  });
});
