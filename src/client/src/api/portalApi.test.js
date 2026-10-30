import portalContracts from './contracts/portalApi.json';
import {
  listJobs, getOverview, getSchedule, getTicker, getJob, listParts, getPart, listPartFiles, downloadFile, fetchDrawingUrl, isDrawing, fileKind, statusLabel, portalError, formatDate, plural, timeAgo,
} from './portalApi';

const respond = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name] ?? null },
  json: async () => body,
  blob: async () => body,
});

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

describe('requests', () => {
  test('listJobs GETs /portal/jobs with limit and offset and returns data', async () => {
    global.fetch.mockResolvedValue(respond(200, [{ id: 1 }]));
    const result = await listJobs({ limit: 10, offset: 20 });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/portal\/jobs\?limit=10&offset=20$/);
    expect(init.method).toBe('GET');
    expect(result).toEqual({ ok: true, data: [{ id: 1 }] });
  });

  test('listJobs with no args omits the query string', async () => {
    global.fetch.mockResolvedValue(respond(200, []));
    await listJobs();
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/jobs$/);
  });

  test('listJobs adds q only when non-blank', async () => {
    global.fetch.mockResolvedValue(respond(200, []));
    await listJobs({ q: 'A-1' });
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/jobs\?q=A-1$/);
    await listJobs({ q: '   ' });
    expect(global.fetch.mock.calls[1][0]).toMatch(/\/portal\/jobs$/);
  });

  test('getJob GETs /portal/jobs/:id', async () => {
    global.fetch.mockResolvedValue(respond(200, { id: 7 }));
    const result = await getJob(7);
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/jobs\/7$/);
    expect(result).toEqual({ ok: true, data: { id: 7 } });
  });

  test('listPartFiles GETs /portal/parts/:id/files', async () => {
    global.fetch.mockResolvedValue(respond(200, []));
    await listPartFiles(3);
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/parts\/3\/files$/);
  });

  test('sends the bearer token', async () => {
    localStorage.setItem('token', 'abc');
    global.fetch.mockResolvedValue(respond(200, {}));
    await getJob(1);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
  });

  test('404 resolves to not_found error', async () => {
    global.fetch.mockResolvedValue(respond(404, {}));
    const result = await getJob(9);
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('not_found');
  });

  test('network failure resolves to error kind', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    const result = await listJobs();
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('error');
  });
});

describe.each([
  ['getOverview', getOverview, /\/portal\/overview$/],
  ['getSchedule', getSchedule, /\/portal\/schedule$/],
  ['getTicker', getTicker, /\/portal\/ticker$/],
])('%s', (_name, fn, pattern) => {
  test('GETs its path and returns data', async () => {
    global.fetch.mockResolvedValue(respond(200, { x: 1 }));
    const result = await fn();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(pattern);
    expect(init.method).toBe('GET');
    expect(result).toEqual({ ok: true, data: { x: 1 } });
  });

  test.each([
    [401, 'signed_out'],
    [429, 'busy'],
  ])('%i resolves to a %s error', async (status, kind) => {
    localStorage.setItem('token', 'abc');
    global.fetch.mockResolvedValue(respond(status));
    const result = await fn();
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe(kind);
    expect(localStorage.getItem('token')).toBe(status === 401 ? null : 'abc');
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    expect(await fn()).toEqual({ ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } });
  });
});

describe('listParts', () => {
  test('requests /portal/parts with no query string by default', async () => {
    global.fetch.mockResolvedValue(respond(200, [{ id: 1 }]));
    const result = await listParts();
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/portal\/parts$/);
    expect(init.method).toBe('GET');
    expect(result).toEqual({ ok: true, data: [{ id: 1 }] });
  });

  test('sends number and description as a query string', async () => {
    global.fetch.mockResolvedValue(respond(200, []));
    await listParts({ number: 'A 1', description: 'brkt' });
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/parts\?number=A\+1&description=brkt$/);
  });

  test.each([
    [{ number: '  ', description: 'brkt' }, /\/portal\/parts\?description=brkt$/],
    [{ number: 'A1', description: '' }, /\/portal\/parts\?number=A1$/],
    [{ number: '', description: '   ' }, /\/portal\/parts$/],
  ])('omits blank values for %j', async (args, pattern) => {
    global.fetch.mockResolvedValue(respond(200, []));
    await listParts(args);
    expect(global.fetch.mock.calls[0][0]).toMatch(pattern);
  });

  test('a failed response returns the portalError', async () => {
    global.fetch.mockResolvedValue(respond(429, {}, { 'Retry-After': '30' }));
    const result = await listParts();
    expect(result).toEqual({ ok: false, error: { kind: 'busy', message: 'Too many requests. Try again in 1 minute.' } });
  });
});

describe('getPart', () => {
  test('GETs /portal/parts/:id with the id URI-encoded', async () => {
    global.fetch.mockResolvedValue(respond(200, { id: 7 }));
    const result = await getPart(7);
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/parts\/7$/);
    expect(result).toEqual({ ok: true, data: { id: 7 } });
    await getPart('a/b');
    expect(global.fetch.mock.calls[1][0]).toMatch(/\/portal\/parts\/a%2Fb$/);
  });

  test('a failed response returns the portalError', async () => {
    global.fetch.mockResolvedValue(respond(404, {}));
    const result = await getPart(9);
    expect(result).toEqual({ ok: false, error: { kind: 'not_found', message: 'Not found.' } });
  });
});

describe('portalError', () => {
  test('401 is signed_out and clears the token', () => {
    localStorage.setItem('token', 'abc');
    expect(portalError(respond(401))).toEqual({
      kind: 'signed_out',
      message: 'Your session has ended. Please sign in again.',
    });
    expect(localStorage.getItem('token')).toBeNull();
  });

  test('429 uses Retry-After minutes, rounded up', () => {
    expect(portalError(respond(429, {}, { 'Retry-After': '90' }))).toEqual({
      kind: 'busy',
      message: 'Too many requests. Try again in 2 minutes.',
    });
  });

  test('429 falls back to RateLimit-Reset, singular minute', () => {
    expect(portalError(respond(429, {}, { 'RateLimit-Reset': '30' })).message)
      .toBe('Too many requests. Try again in 1 minute.');
  });

  test('429 without headers says try again later', () => {
    expect(portalError(respond(429)).message).toBe('Try again later.');
  });

  test('404 is not_found', () => {
    expect(portalError(respond(404)).kind).toBe('not_found');
  });

  test('500 is error', () => {
    expect(portalError(respond(500)).kind).toBe('error');
  });
});

describe('downloadFile', () => {
  test('GETs the file, clicks a download link named filename, revokes the URL', async () => {
    global.fetch.mockResolvedValue(respond(200, 'blob-data'));
    global.URL.createObjectURL = jest.fn(() => 'blob:x');
    global.URL.revokeObjectURL = jest.fn();
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      click.seen = { download: this.download, href: this.href };
    });

    const result = await downloadFile({ id: 5, filename: 'part.pdf' });

    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/files\/5$/);
    expect(global.URL.createObjectURL).toHaveBeenCalledWith('blob-data');
    expect(click.seen).toEqual({ download: 'part.pdf', href: 'blob:x' });
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
    expect(result).toEqual({ ok: true });
    click.mockRestore();
  });

  test('failed download returns the error and saves nothing', async () => {
    global.fetch.mockResolvedValue(respond(404));
    global.URL.createObjectURL = jest.fn();
    const result = await downloadFile({ id: 5, filename: 'a.pdf' });
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('not_found');
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('fetchDrawingUrl', () => {
  test('GETs the file and resolves a blob URL without clicking or revoking it', async () => {
    global.fetch.mockResolvedValue(respond(200, 'blob-data'));
    global.URL.createObjectURL = jest.fn(() => 'blob:d');
    global.URL.revokeObjectURL = jest.fn();
    const result = await fetchDrawingUrl({ id: 8, filename: 'a.pdf' });
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/files\/8$/);
    expect(global.fetch.mock.calls[0][1].method).toBe('GET');
    expect(global.URL.createObjectURL).toHaveBeenCalledWith('blob-data');
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, url: 'blob:d' });
  });

  test.each([
    [401, 'signed_out'],
    [404, 'not_found'],
    [429, 'busy'],
  ])('%i resolves to a %s error and makes no blob URL', async (status, kind) => {
    global.fetch.mockResolvedValue(respond(status));
    global.URL.createObjectURL = jest.fn();
    const result = await fetchDrawingUrl({ id: 8, filename: 'a.pdf' });
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe(kind);
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    const result = await fetchDrawingUrl({ id: 8, filename: 'a.pdf' });
    expect(result).toEqual({ ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } });
  });
});

describe('isDrawing', () => {
  test.each([
    [{ filename: 'a.PDF', mimetype: 'application/octet-stream' }, true],
    [{ filename: 'noext', mimetype: 'application/pdf' }, true],
    [{ filename: 'a.step', mimetype: '' }, false],
    [{ filename: 'a.png', mimetype: 'image/png' }, false],
  ])('%j -> %s', (file, expected) => {
    expect(isDrawing(file)).toBe(expected);
  });
});

describe('fileKind', () => {
  test.each([
    [{ filename: 'a.PDF', mimetype: 'application/octet-stream' }, 'PDF'],
    [{ filename: 'noext', mimetype: 'application/pdf' }, 'PDF'],
    [{ filename: 'a.step', mimetype: '' }, 'STEP'],
    [{ filename: 'a.STP', mimetype: null }, 'STEP'],
    [{ filename: 'a.png', mimetype: 'image/png' }, 'Other'],
  ])('%j -> %s', (file, expected) => {
    expect(fileKind(file)).toBe(expected);
  });
});

describe('statusLabel', () => {
  test.each([
    ['programming', 'Programming'],
    ['open', 'Open'],
    ['shipped', 'Shipped'],
    ['on_hold_now', 'On Hold Now'],
  ])('%s -> %s', (key, expected) => {
    expect(statusLabel(key)).toBe(expected);
  });
});

describe('formatDate', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  test.each([
    ['2026-10-30', 'Fri 30 Oct'],
    ['2026-03-07', 'Sat 7 Mar'],
    ['2027-10-30', 'Sat 30 Oct 2027'],
    ['2025-12-01', 'Mon 1 Dec 2025'],
    ['2026-10-30T23:59:59Z', 'Fri 30 Oct'],
    ['2026-10-30T00:00:00Z', 'Fri 30 Oct'],
    ['', '—'],
    [null, '—'],
  ])('formats %p as %p', (value, expected) => {
    expect(formatDate(value, now)).toBe(expected);
  });

  test('compares the year against the real clock when now is omitted', () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-01-05T12:00:00Z'));
    try {
      expect(formatDate('2027-10-30')).toBe('Sat 30 Oct');
      expect(formatDate('2026-10-30')).toBe('Fri 30 Oct 2026');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('plural', () => {
  test.each([
    [1, 'part', '1 part'],
    [3, 'part', '3 parts'],
    [0, 'line', '0 lines'],
  ])('plural(%p, %p) is %p', (count, word, expected) => {
    expect(plural(count, word)).toBe(expected);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-10-29T01:00:00Z');

  test.each([
    ['2026-10-29', 'today'],
    ['2026-10-29T23:59:59Z', 'today'],
    ['2026-10-28T23:59:59Z', '1d ago'],
    ['2026-10-24', '5d ago'],
    ['', '—'],
    [null, '—'],
  ])('reads %p as %p', (value, expected) => {
    expect(timeAgo(value, now)).toBe(expected);
  });

  test('uses the real clock when now is omitted', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-29T12:00:00Z'));
    try {
      expect(timeAgo('2026-10-27')).toBe('2d ago');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('portalApi contract fixture', () => {
  const entries = Object.entries(portalContracts);
  const fns = { getOverview, getSchedule, getTicker, listJobs, getJob, listParts, getPart, listPartFiles, downloadFile, fetchDrawingUrl };

  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => 'blob:abc');
    global.URL.revokeObjectURL = jest.fn();
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('has an entry for every fixture function under test', () => {
    expect(Object.keys(portalContracts).sort()).toEqual(Object.keys(fns).sort());
  });

  test.each(entries)('%s sends the fixture request', async (name, entry) => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await fns[name](...entry.args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(entry.path)).toBe(true);
    expect(init.method).toBe(entry.method);
    expect(init.body === undefined ? null : JSON.parse(init.body)).toEqual(entry.body);
  });
});
