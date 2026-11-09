import contracts from './contracts/qcAdminApi.json';
import * as api from './qcAdminApi';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  blob: async () => 'blob-data',
});

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
  global.URL.createObjectURL = jest.fn(() => 'blob:photo');
});

const GENERIC = { ok: false, error: { kind: 'error', message: 'Something went wrong. Please try again.' } };

describe('qcAdminApi contract fixture', () => {
  test.each(Object.entries(contracts).filter(([name]) => name !== 'uploadPhoto'))(
    '%s sends its fixture request',
    async (name, entry) => {
      global.fetch.mockResolvedValue(respond(200, {}));
      await api[name](...entry.args);
      const [url, init] = global.fetch.mock.calls[0];
      expect(url.endsWith(entry.path)).toBe(true);
      expect(init.method).toBe(entry.method);
      expect(init.body === undefined ? null : JSON.parse(init.body)).toEqual(entry.body);
    }
  );

  test('uploadPhoto sends its fixture fields and file as multipart', async () => {
    const { args, file, method, path, body } = contracts.uploadPhoto;
    global.fetch.mockResolvedValue(respond(201, { id: 3 }));
    const photo = new File(['abc'], file.name, { type: file.type });
    const result = await api.uploadPhoto(...args, photo);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(path)).toBe(true);
    expect(init.method).toBe(method);
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers['Content-Type']).toBeUndefined();
    const sent = Object.fromEntries(init.body.entries());
    const { [file.field]: sentFile, ...fields } = sent;
    expect(fields).toEqual(body);
    expect(sentFile.name).toBe(file.name);
    expect(sentFile.type).toBe(file.type);
    expect(result).toEqual({ ok: true, data: { id: 3 } });
  });

  test('uploadPhoto omits value and caption it was not given', async () => {
    global.fetch.mockResolvedValue(respond(201, { id: 3 }));
    await api.uploadPhoto(1, { job_id: 1 }, new File(['abc'], 'p.jpg', { type: 'image/jpeg' }));
    const keys = [...global.fetch.mock.calls[0][1].body.keys()];
    expect(keys.sort()).toEqual(['job_id', 'photo']);
  });
});

describe('JSON calls', () => {
  test('return data on success', async () => {
    global.fetch.mockResolvedValue(respond(200, [{ id: 1 }]));
    expect(await api.listQcRequests()).toEqual({ ok: true, data: [{ id: 1 }] });
  });

  test.each([400, 403, 413])('%i returns the server error message', async (status) => {
    global.fetch.mockResolvedValue(respond(status, { error: 'nope' }));
    expect(await api.updatePhoto(1, {})).toEqual({ ok: false, error: { kind: 'invalid', message: 'nope' } });
  });

  test('a 500 resolves to the generic error', async () => {
    global.fetch.mockResolvedValue(respond(500, { error: 'boom' }));
    expect(await api.deletePhoto(1)).toEqual(GENERIC);
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    expect(await api.getAdminPartQc(1)).toEqual(GENERIC);
  });
});

describe('fetchAdminPhotoUrl', () => {
  test('returns an object URL for the photo blob', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));
    expect(await api.fetchAdminPhotoUrl(1)).toEqual({ ok: true, url: 'blob:photo' });
    expect(global.URL.createObjectURL).toHaveBeenCalledWith('blob-data');
  });

  test('a failed response resolves to the generic error and creates no object URL', async () => {
    global.fetch.mockResolvedValue(respond(404, {}));
    expect(await api.fetchAdminPhotoUrl(1)).toEqual(GENERIC);
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('network failure resolves to the generic error', async () => {
    global.fetch.mockRejectedValue(new TypeError('offline'));
    expect(await api.fetchAdminPhotoUrl(1)).toEqual(GENERIC);
  });
});
