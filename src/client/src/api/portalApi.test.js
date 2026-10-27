import {
  listJobs, getJob, listPartFiles, downloadFile, fileKind, statusLabel, portalError,
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

describe('fileKind', () => {
  test.each([
    [{ filename: 'a.PDF', mimetype: 'application/octet-stream' }, 'Drawing'],
    [{ filename: 'noext', mimetype: 'application/pdf' }, 'Drawing'],
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
