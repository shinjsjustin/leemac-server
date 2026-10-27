import {
  getDeviceToken, saveDeviceToken, clearDeviceToken,
  skipWithTrustedBrowser, listTrustedBrowsers, revokeTrustedBrowser, revokeAllTrustedBrowsers,
} from './trustedDevices';

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: () => null },
  json: async () => body,
});

const lastCall = () => {
  const [url, init] = global.fetch.mock.calls[0];
  return { path: url.replace(/^.*\/api(?=\/)/, ''), init };
};

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

describe('device token storage', () => {
  test('saves, reads and clears under the trustedDevice key', () => {
    expect(getDeviceToken()).toBeNull();
    saveDeviceToken('abc');
    expect(localStorage.getItem('trustedDevice')).toBe('abc');
    expect(getDeviceToken()).toBe('abc');
    clearDeviceToken();
    expect(localStorage.getItem('trustedDevice')).toBeNull();
  });
});

describe('skipWithTrustedBrowser', () => {
  test('makes no request without a stored token', async () => {
    expect(await skipWithTrustedBrowser('p')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('POSTs pendingToken and deviceToken and returns data.token on 200', async () => {
    saveDeviceToken('dev');
    global.fetch.mockResolvedValue(respond(200, { token: 'jwt' }));
    expect(await skipWithTrustedBrowser('pend')).toBe('jwt');
    const { path, init } = lastCall();
    expect(path).toBe('/admin/mfa/trusted');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ pendingToken: 'pend', deviceToken: 'dev' });
    expect(getDeviceToken()).toBe('dev');
  });

  test('clears the stored token on 403', async () => {
    saveDeviceToken('dev');
    global.fetch.mockResolvedValue(respond(403, {}));
    expect(await skipWithTrustedBrowser('p')).toBeNull();
    expect(getDeviceToken()).toBeNull();
  });

  test.each([401, 429, 500])('keeps the stored token on %i', async (status) => {
    saveDeviceToken('dev');
    global.fetch.mockResolvedValue(respond(status, {}));
    expect(await skipWithTrustedBrowser('p')).toBeNull();
    expect(getDeviceToken()).toBe('dev');
  });
});

describe('listTrustedBrowsers', () => {
  test('self list uses GET /admin/trusted-devices', async () => {
    global.fetch.mockResolvedValue(respond(200, { devices: [{ id: 1 }] }));
    expect(await listTrustedBrowsers()).toEqual([{ id: 1 }]);
    const { path, init } = lastCall();
    expect(path).toBe('/admin/trusted-devices');
    expect(init.method).toBe('GET');
  });

  test('admin list uses GET /internal/admins/trusted-devices/<adminId>', async () => {
    global.fetch.mockResolvedValue(respond(200, { devices: [] }));
    await listTrustedBrowsers(7);
    expect(lastCall().path).toBe('/internal/admins/trusted-devices/7');
  });

  test('throws the server error text when not ok', async () => {
    global.fetch.mockResolvedValue(respond(403, { error: 'Nope.' }));
    await expect(listTrustedBrowsers()).rejects.toThrow('Nope.');
  });

  test('throws a default message when the server sends none', async () => {
    global.fetch.mockResolvedValue(respond(500, {}));
    await expect(listTrustedBrowsers(3)).rejects.toThrow('Request failed.');
  });
});

describe('revokeTrustedBrowser', () => {
  test('self revoke uses DELETE /admin/trusted-devices/<deviceId>', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await revokeTrustedBrowser(9);
    const { path, init } = lastCall();
    expect(path).toBe('/admin/trusted-devices/9');
    expect(init.method).toBe('DELETE');
  });

  test('admin revoke POSTs numeric adminId and deviceId', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await revokeTrustedBrowser('9', '4');
    const { path, init } = lastCall();
    expect(path).toBe('/internal/admins/revoke-trusted-devices');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ adminId: 4, deviceId: 9 });
  });

  test('throws the server error text when not ok', async () => {
    global.fetch.mockResolvedValue(respond(404, { error: 'Not found.' }));
    await expect(revokeTrustedBrowser(1)).rejects.toThrow('Not found.');
  });
});

describe('revokeAllTrustedBrowsers', () => {
  test('self uses DELETE /admin/trusted-devices', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await revokeAllTrustedBrowsers();
    const { path, init } = lastCall();
    expect(path).toBe('/admin/trusted-devices');
    expect(init.method).toBe('DELETE');
  });

  test('admin POSTs only the numeric adminId', async () => {
    global.fetch.mockResolvedValue(respond(200, {}));
    await revokeAllTrustedBrowsers('4');
    const { path, init } = lastCall();
    expect(path).toBe('/internal/admins/revoke-trusted-devices');
    expect(JSON.parse(init.body)).toEqual({ adminId: 4 });
  });

  test('throws a default message when the server sends none', async () => {
    global.fetch.mockResolvedValue(respond(500, {}));
    await expect(revokeAllTrustedBrowsers(4)).rejects.toThrow('Request failed.');
  });
});
