import {
  listInbox, getReview, saveReview, checkMatches, createJob, fetchRequestFileUrl, requestStatusLabel,
} from './quoteRequestsAdminApi';
import { apiFetch } from './apiFetch';

jest.mock('./apiFetch', () => ({ apiFetch: jest.fn() }));

const respond = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

beforeEach(() => {
  apiFetch.mockReset();
  global.URL.createObjectURL = jest.fn(() => 'blob:abc');
});

describe('calls', () => {
  test.each([
    ['listInbox', () => listInbox(), ['/internal/quote-requests', { method: 'GET' }]],
    ['listInbox with status', () => listInbox('sent'), ['/internal/quote-requests?status=sent', { method: 'GET' }]],
    ['getReview', () => getReview('a/b'), ['/internal/quote-requests/a%2Fb', { method: 'GET' }]],
    ['saveReview', () => saveReview(4, [{ id: 1 }]),
      ['/internal/quote-requests/4', { method: 'PUT', body: { lines: [{ id: 1 }] } }]],
    ['checkMatches', () => checkMatches(4), ['/internal/quote-requests/4/check', { method: 'GET' }]],
    ['createJob', () => createJob(4), ['/internal/quote-requests/4/job', { method: 'POST' }]],
  ])('%s uses the right method and path and returns data', async (_name, call, args) => {
    apiFetch.mockResolvedValue(respond(200, { x: 1 }));
    const result = await call();
    expect(apiFetch).toHaveBeenCalledWith(...args);
    expect(result).toEqual({ ok: true, data: { x: 1 } });
  });

  test('createJob resolves the 201 body', async () => {
    apiFetch.mockResolvedValue(respond(201, { id: 7, job_number: 'J-7' }));
    expect(await createJob(4)).toEqual({ ok: true, data: { id: 7, job_number: 'J-7' } });
  });
});

describe('errors', () => {
  test.each([
    [400, 'invalid', 'Bad line'],
    [409, 'invalid', 'Bad line'],
    [401, 'denied', 'Something went wrong. Please try again.'],
    [403, 'denied', 'Something went wrong. Please try again.'],
    [404, 'not_found', 'Something went wrong. Please try again.'],
    [500, 'error', 'Something went wrong. Please try again.'],
  ])('status %i maps to kind %s', async (status, kind, message) => {
    apiFetch.mockResolvedValue(respond(status, { error: 'Bad line' }));
    const result = await getReview(1);
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe(kind);
    expect(result.error.message).toBe(message);
  });

  test('invalid without an error body gets a generic sentence', async () => {
    apiFetch.mockResolvedValue({ ok: false, status: 409, json: async () => { throw new Error('no json'); } });
    expect(await createJob(1)).toEqual({
      ok: false,
      error: { kind: 'invalid', message: 'Something went wrong. Please try again.' },
    });
  });

  test('network failure gives kind error', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    const result = await listInbox();
    expect(result.ok).toBe(false);
    expect(result.error.kind).toBe('error');
  });
});

describe('fetchRequestFileUrl', () => {
  test('returns an object URL from the blob', async () => {
    const blob = {};
    apiFetch.mockResolvedValue({ ok: true, status: 200, blob: async () => blob });
    const result = await fetchRequestFileUrl('4', 'f/1');
    expect(apiFetch).toHaveBeenCalledWith('/internal/quote-requests/4/files/f%2F1');
    expect(global.URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(result).toEqual({ ok: true, url: 'blob:abc' });
  });

  test('maps a 404 and creates no object URL', async () => {
    apiFetch.mockResolvedValue(respond(404, { error: 'nope' }));
    const result = await fetchRequestFileUrl(4, 1);
    expect(result.error.kind).toBe('not_found');
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('returns kind error when the request throws', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    const result = await fetchRequestFileUrl(4, 1);
    expect(result.error.kind).toBe('error');
    expect(global.URL.createObjectURL).not.toHaveBeenCalled();
  });
});

test.each([
  ['sent', 'Sent'],
  ['in_review', 'In review'],
  ['job_created', 'Job created'],
])('requestStatusLabel maps %s', (status, label) => {
  expect(requestStatusLabel(status)).toBe(label);
});
