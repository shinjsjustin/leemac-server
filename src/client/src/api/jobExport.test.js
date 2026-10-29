import contracts from './contracts/jobExport.json';
import { TYPE_LABELS, runJobExport, exportMessage } from './jobExport';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});

const saved = (type, filename) => ({ type, fileId: 5, filename });

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

describe('runJobExport request', () => {
  test('POSTs {types} to /internal/job/export?id=<id> through apiFetch', async () => {
    localStorage.setItem('token', 'tok');
    global.fetch.mockResolvedValue(respond(200, { results: [], skipped: [] }));
    await runJobExport(42, ['quote', 'order']);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/internal\/job\/export\?id=42$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ types: ['quote', 'order'] });
  });
});

describe('runJobExport contract fixture', () => {
  test.each(contracts.runJobExport.map((entry) => [entry.path + ' ' + JSON.stringify(entry.body), entry]))(
    'sends %s',
    async (_name, entry) => {
      global.fetch.mockResolvedValue(respond(200, { results: [], skipped: [] }));
      await runJobExport(...entry.args);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url.endsWith(entry.path)).toBe(true);
      expect(init.method).toBe(entry.method);
      expect(JSON.parse(init.body)).toEqual(entry.body);
    }
  );
});

describe('messages', () => {
  test('all saved lists each filename', async () => {
    global.fetch.mockResolvedValue(respond(200, {
      results: [saved('quote', 'Quote-1.pdf'), saved('packing', 'Packing-1.pdf')],
      skipped: [],
    }));
    const out = await runJobExport(1, ['quote', 'packing']);
    expect(out.ok).toBe(true);
    expect(out.message).toBe(
      'Quote saved to job files as Quote-1.pdf\nPacking List saved to job files as Packing-1.pdf'
    );
  });

  test('old script with no PDF says nothing was saved', () => {
    const { message } = exportMessage(200, {
      results: [{ type: 'invoice', fileId: null, filename: null }],
      skipped: [],
    });
    expect(message).toBe('Invoice exported, but no PDF came back (old export script), so nothing was saved');
  });

  test('409 shows the server error as is', () => {
    const error = 'The PDF was for another job and was not saved';
    const { message, ok } = exportMessage(409, { error, failedType: 'order', results: [], skipped: [] });
    expect(ok).toBe(false);
    expect(message).toBe(`Order failed: ${error}`);
  });

  test('partial failure lists saved, failed and skipped', () => {
    const { message, ok } = exportMessage(502, {
      error: 'Export script failed',
      failedType: 'order',
      results: [saved('quote', 'Quote-1.pdf')],
      skipped: ['invoice', 'shipping'],
    });
    expect(ok).toBe(false);
    expect(message).toBe([
      'Quote saved to job files as Quote-1.pdf',
      'Order failed: Export script failed',
      'Not run: Invoice, Shipping',
    ].join('\n'));
  });

  test('failure with nothing skipped has no Not run line', () => {
    const { message } = exportMessage(500, { error: 'Export failed', failedType: 'quote', results: [], skipped: [] });
    expect(message).toBe('Quote failed: Export failed');
  });

  test('failure without failedType shows the bare error', () => {
    const { message } = exportMessage(400, { error: 'Unknown export type' });
    expect(message).toBe('Export failed: Unknown export type');
  });

  test('TYPE_LABELS names all five types', () => {
    expect(TYPE_LABELS).toEqual({
      quote: 'Quote', order: 'Order', invoice: 'Invoice', packing: 'Packing List', shipping: 'Shipping',
    });
  });
});

describe('unreachable or unreadable replies', () => {
  const unreachable = { ok: false, refresh: false, message: 'Export failed: could not reach the server' };

  test('network error resolves with ok false', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(runJobExport(1, ['quote'])).resolves.toEqual(unreachable);
  });

  test('non-JSON reply resolves with ok false', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError('x'); } });
    await expect(runJobExport(1, ['quote'])).resolves.toEqual(unreachable);
  });
});

describe('refresh', () => {
  test('true when at least one result has a fileId, even on partial failure', async () => {
    global.fetch.mockResolvedValue(respond(502, {
      error: 'Export script failed', failedType: 'order',
      results: [saved('quote', 'Quote-1.pdf')], skipped: [],
    }));
    const out = await runJobExport(1, ['quote', 'order']);
    expect(out.ok).toBe(false);
    expect(out.refresh).toBe(true);
  });

  test('false when no result has a fileId', async () => {
    global.fetch.mockResolvedValue(respond(200, {
      results: [{ type: 'quote', fileId: null, filename: null }], skipped: [],
    }));
    expect((await runJobExport(1, ['quote'])).refresh).toBe(false);
  });
});
