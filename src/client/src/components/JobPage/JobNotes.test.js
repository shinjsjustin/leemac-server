import React, { act } from 'react';
import { render } from '../../testUtils/render';
import JobNotes from './JobNotes';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const NOTES = [
  { id: 1, content: 'First article passed', author: 'Justin', is_client: 0, shared: 1, created_at: '2026-10-20T08:40:00Z', part_number: 'HSX2-0870' },
  { id: 2, content: 'Anodizer Monday', author: 'Josh', is_client: 0, shared: 0, created_at: '2026-10-19T16:05:00Z' },
  { id: 3, content: 'Rev G please', author: 'Priya N.', is_client: 1, shared: 1, created_at: '2026-10-18T10:00:00Z' },
];
const FILE = { id: 9, filename: 'quote.pdf', mimetype: 'application/pdf', size: 2048, content: null };
const reply = (status, body = {}) => ({ status, ok: status < 400, json: async () => body, blob: async () => new Blob(['x']) });

const mount = async (accessLevel = 3) => {
  let view;
  await act(async () => { view = render(<JobNotes jobId={55} userId={4} accessLevel={accessLevel} />); });
  return view.container;
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));
const click = (el) => act(async () => { el.click(); });
const typeNote = (c, value) => act(async () => {
  const ta = c.querySelector('textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, value);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
});
const bodyOf = (url) => apiFetch.mock.calls.find((c) => c[0].startsWith(url))?.[1].body;

beforeEach(() => {
  window.alert = jest.fn();
  global.fetch = jest.fn(async () => ({}));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  apiFetch.mockImplementation(async (url, opts) => {
    if (url.startsWith('/internal/notes/getnote')) return reply(200, NOTES);
    if (url.startsWith('/internal/notes/getblob')) return reply(200, url.endsWith('=2') ? [FILE] : []);
    if (url.startsWith('/internal/notes/newnote')) return reply(201, { id: 77 });
    if (url.startsWith('/internal/job/jobsummary')) return reply(200, { job: { attention: 'Bob', job_number: '13804' } });
    return reply(200);
  });
});
afterEach(() => { jest.resetAllMocks(); jest.restoreAllMocks(); document.body.innerHTML = ''; });

test('lists notes with tags, part number, author, client marker and files', async () => {
  const c = await mount();
  const items = c.querySelectorAll('.jn-note');
  expect(items).toHaveLength(3);
  expect(items[0].textContent).toContain('SHARED');
  expect(items[0].textContent).toContain('HSX2-0870');
  expect(items[0].textContent).toContain('Justin');
  expect(items[0].textContent).not.toContain('(client)');
  expect(items[1].textContent).toContain('PRIVATE');
  expect(items[1].textContent).toContain('quote.pdf');
  expect(items[2].textContent).toContain('Priya N. (client)');
  expect(apiFetch).toHaveBeenCalledWith('/internal/notes/getnote?jobid=55');
});

test('tabs show counts and filter the list', async () => {
  const c = await mount();
  expect(button(c, 'All').textContent).toBe('All 3');
  expect(button(c, 'Private').textContent).toBe('Private 1');
  expect(button(c, 'Shared').textContent).toBe('Shared 2');
  await click(button(c, 'Private'));
  expect(c.querySelectorAll('.jn-note')).toHaveLength(1);
  expect(c.querySelector('.jn-note').textContent).toContain('Anodizer Monday');
  await click(button(c, 'Shared'));
  expect(c.querySelectorAll('.jn-note')).toHaveLength(2);
});

test('adding a note defaults to private, posts to the script and refetches', async () => {
  const c = await mount();
  await typeNote(c, 'Hello');
  await click(button(c, 'Add note'));
  expect(bodyOf('/internal/notes/newnote')).toEqual({ content: 'Hello', userid: 4, jobid: 55, shared: false });
  const [, opts] = global.fetch.mock.calls[0];
  expect(JSON.parse(opts.body)).toEqual({ note: { content: 'Hello', attention: 'Bob', job: '13804' } });
  expect(c.querySelector('textarea').value).toBe('');
  expect(apiFetch.mock.calls.filter((x) => x[0].startsWith('/internal/notes/getnote'))).toHaveLength(2);
});

test('share switch sends shared true and attached files upload to the new note', async () => {
  const c = await mount();
  await typeNote(c, 'With file');
  await click(c.querySelector('input[type="checkbox"]'));
  const input = c.querySelector('input[type="file"]');
  const file = new File(['abc'], 'a.txt');
  await act(async () => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(c.textContent).toContain('a.txt');
  await click(button(c, 'Add note'));
  expect(bodyOf('/internal/notes/newnote').shared).toBe(true);
  const upload = apiFetch.mock.calls.find((x) => x[0] === '/internal/notes/uploadblob?id=77');
  expect(upload[1].method).toBe('POST');
  expect(upload[1].body.getAll('files')).toEqual([file]);
});

test('empty note is rejected without posting', async () => {
  const c = await mount();
  await click(button(c, 'Add note'));
  expect(window.alert).toHaveBeenCalled();
  expect(apiFetch.mock.calls.some((x) => x[0].startsWith('/internal/notes/newnote'))).toBe(false);
});

test('toggle share puts the opposite value; client notes have no toggle', async () => {
  const c = await mount();
  const items = c.querySelectorAll('.jn-note');
  expect(items[2].querySelector('.jn-toggle')).toBeNull();
  await click(items[1].querySelector('.jn-toggle'));
  const call = apiFetch.mock.calls.find((x) => x[0] === '/internal/notes/share');
  expect(call[1]).toEqual({ method: 'PUT', body: { id: 2, shared: true } });
});

test('delete calls the delete endpoint and there is no status UI', async () => {
  const c = await mount();
  await click(c.querySelectorAll('.jn-note')[0].querySelector('button.danger'));
  const call = apiFetch.mock.calls.find((x) => x[0] === '/internal/notes/delete');
  expect(call[1]).toEqual({ method: 'DELETE', body: { id: 1 } });
  expect(c.textContent.toLowerCase()).not.toContain('status');
  expect(apiFetch.mock.calls.some((x) => x[0].includes('updatestatus'))).toBe(false);
});

test('clicking a note file downloads it via the blob endpoint', async () => {
  window.URL.createObjectURL = jest.fn(() => 'blob:x');
  window.URL.revokeObjectURL = jest.fn();
  const c = await mount();
  await click(button(c.querySelectorAll('.jn-note')[1], 'quote.pdf'));
  expect(apiFetch).toHaveBeenCalledWith('/internal/part/blob/download?fileID=9');
  expect(window.URL.createObjectURL).toHaveBeenCalled();
});

test.each([[0, false], [1, false], [2, true]])('level %i: Delete shown is %s', async (level, shown) => {
  const c = await mount(level);
  expect(!!button(c, 'Delete')).toBe(shown);
});
