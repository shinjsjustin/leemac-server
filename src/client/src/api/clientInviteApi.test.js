import { listCompanies, inviteClient } from './clientInviteApi';
import contracts from './contracts/clientInviteApi.json';

const respond = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name] ?? null },
  json: async () => body,
});

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('listCompanies', () => {
  test('resolves ok with the companies on 200', async () => {
    global.fetch.mockResolvedValue(respond(200, [{ id: 1, name: 'Acme' }]));
    expect(await listCompanies()).toEqual({ ok: true, companies: [{ id: 1, name: 'Acme' }] });
  });

  test('treats 404 as an empty list', async () => {
    global.fetch.mockResolvedValue(respond(404, { error: 'No companies found' }));
    expect(await listCompanies()).toEqual({ ok: true, companies: [] });
  });

  test('returns the server error on other failures', async () => {
    global.fetch.mockResolvedValue(respond(500, { error: 'Internal server error' }));
    expect(await listCompanies()).toEqual({ ok: false, error: 'Internal server error' });
  });

  test('returns an error result when the request throws', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    const result = await listCompanies();
    expect(result.ok).toBe(false);
    expect(result.error).toEqual(expect.any(String));
  });
});

describe('inviteClient', () => {
  const args = { email: 'a@b.c', name: 'Ann', companyId: '7' };

  test('resolves ok with the server message on 201', async () => {
    global.fetch.mockResolvedValue(respond(201, { message: 'Invite sent' }));
    expect(await inviteClient(args)).toEqual({ ok: true, message: 'Invite sent' });
  });

  test.each([
    [409, { error: 'User with email exists' }, 'User with email exists'],
    [404, { error: 'Company not found' }, 'Company not found'],
  ])('returns the server error text on %i', async (status, body, error) => {
    global.fetch.mockResolvedValue(respond(status, body));
    expect(await inviteClient(args)).toEqual({ ok: false, error });
  });

  test('uses the too-many-attempts message on 429', async () => {
    global.fetch.mockResolvedValue(respond(429, {}, { 'Retry-After': '120' }));
    expect(await inviteClient(args)).toEqual({ ok: false, error: 'Too many attempts. Try again in 2 minutes.' });
  });

  test('returns an error result when the request throws', async () => {
    global.fetch.mockRejectedValue(new Error('offline'));
    expect((await inviteClient(args)).ok).toBe(false);
  });
});

describe('clientInviteApi contract fixture', () => {
  const fns = { listCompanies, inviteClient };

  test('has an entry for every function under test', () => {
    expect(Object.keys(contracts).sort()).toEqual(Object.keys(fns).sort());
  });

  test.each(Object.entries(contracts))('%s sends the fixture request', async (name, entry) => {
    global.fetch.mockResolvedValue(respond(200, []));
    await fns[name](...entry.args);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url.endsWith(entry.path)).toBe(true);
    expect(init.method).toBe(entry.method);
    expect(init.body === undefined ? null : JSON.parse(init.body)).toEqual(entry.body);
    if (entry.body) expect(typeof JSON.parse(init.body).company_id).toBe('number');
  });
});
