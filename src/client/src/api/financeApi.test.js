import contracts from './contracts/financeApi.json';
import { downloadReport, setPaidDate } from './financeApi';

const GENERIC = 'Something went wrong. Please try again.';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
  blob: async () => 'BLOB',
});

const api = { downloadReport, setPaidDate };

let clicked;
beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
  clicked = [];
  global.URL.createObjectURL = jest.fn(() => 'blob:x');
  global.URL.revokeObjectURL = jest.fn();
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
    clicked.push({ href: this.href, download: this.download });
  });
});
afterEach(() => jest.restoreAllMocks());

describe('contract fixtures', () => {
  test.each(Object.entries(contracts))('%s sends its fixture', async (name, fixture) => {
    const { fn, args, method, path, body, download } = fixture;
    global.fetch.mockResolvedValue(respond(200, { ok: true }));
    const result = await api[fn](...args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(path)).toBe(true);
    expect(init.method).toBe(method);
    expect(init.body).toBe(body ? JSON.stringify(body) : undefined);
    expect(result.ok).toBe(true);
    if (download) expect(clicked).toEqual([{ href: 'blob:x', download }]);
  });
});

describe('downloadReport', () => {
  test('saves nothing and reports the server error when refused', async () => {
    global.fetch.mockResolvedValue(respond(404, { error: 'Financial period not found' }));
    expect(await downloadReport('ledger', 'pdf', { periodId: 99 }, 'x'))
      .toEqual({ ok: false, error: { message: 'Financial period not found' } });
    expect(clicked).toEqual([]);
  });

  test('does not throw when the network fails', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    expect(await downloadReport('ledger', 'pdf', { periodId: 7 }, 'x'))
      .toEqual({ ok: false, error: { message: GENERIC } });
  });
});

describe('setPaidDate', () => {
  test('carries the server error text on a refusal', async () => {
    global.fetch.mockResolvedValue(respond(400, { error: 'Invalid paid date' }));
    expect(await setPaidDate(12, 'soon')).toEqual({ ok: false, error: { message: 'Invalid paid date' } });
  });

  test('does not throw when the network fails', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    expect(await setPaidDate(12, null)).toEqual({ ok: false, error: { message: GENERIC } });
  });
});
