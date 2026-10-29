import React, { act } from 'react';
import { Simulate } from 'react-dom/test-utils';
import { render } from '../../testUtils/render';
import QuoteRequestReview from './QuoteRequestReview';
import * as api from '../../api/quoteRequestsAdminApi';
import { fetchAdminDrawingUrl } from '../../api/adminDrawing';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: '7' }),
}));
jest.mock('../../api/adminDrawing', () => ({ fetchAdminDrawingUrl: jest.fn() }));
jest.mock('../Navbar', () => () => null);
jest.mock('../PdfImage', () => ({
  PdfThumbnail: ({ previewUrl, onClick }) => <div className="thumb" data-url={previewUrl} onClick={onClick} />,
}));
jest.mock('../../api/quoteRequestsAdminApi', () => ({
  getReview: jest.fn(),
  saveReview: jest.fn(),
  checkMatches: jest.fn(),
  createJob: jest.fn(),
  removeLine: jest.fn(),
  fetchRequestFileUrl: jest.fn(),
  requestStatusLabel: (s) => ({ sent: 'Sent', in_review: 'In review', job_created: 'Job created' })[s] ?? String(s),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const line = (over = {}) => ({
  id: 11, part_number: 'A1', description: 'd', rev: 'B', material: 'Al', finish: 'None',
  quantity: 5, price: '2.50', files: [], bourne_suggestion: null, ...over,
});
const review = (over = {}) => ({
  id: 7, company_name: 'Acme', client_name: 'Pat', name: 'Spring order', need_by: '2026-12-01T12:00:00',
  note: 'Rush please', status: 'in_review', job_id: null, lines: [line()],
  files: [{ id: 3, filename: 'spec.pdf' }], ...over,
});

let view;
const mount = async (data = review()) => {
  api.getReview.mockResolvedValue({ ok: true, data });
  await act(async () => { view = render(<QuoteRequestReview />); });
};
const button = (text) => [...view.container.querySelectorAll('button')].find((b) => b.textContent === text);
const click = async (text) => { await act(async () => { button(text).click(); }); };

beforeEach(() => {
  jest.resetAllMocks();
  window.open = jest.fn();
});
afterEach(() => view?.unmount());

test('loads the review for the route id and shows header, grid and request files', async () => {
  await mount();
  expect(api.getReview).toHaveBeenCalledWith('7');
  const text = view.container.textContent;
  ['Acme', 'Pat', 'Spring order', 'Rush please', 'In review'].forEach((t) => expect(text).toContain(t));
  expect(text).toContain('12/1/2026');
  expect(view.container.querySelector('#review-11-part_number').value).toBe('A1');
  expect(button('spec.pdf')).toBeTruthy();
});

test('save sends every line with seven fields and shows the saved status', async () => {
  await mount();
  api.saveReview.mockResolvedValue({ ok: true, data: review({ lines: [line({ description: 'server' })] }) });
  await click('Save');
  expect(api.saveReview).toHaveBeenCalledWith('7', [
    { id: 11, part_number: 'A1', description: 'd', rev: 'B', material: 'Al', finish: 'None', quantity: 5, price: '2.50' },
  ]);
  expect(view.container.querySelector('#review-11-description').value).toBe('server');
  expect(view.container.textContent).toContain('Saved');
});

test('check passes matches by line id to the grid', async () => {
  await mount();
  api.checkMatches.mockResolvedValue({ ok: true, data: [{ line_id: 11, part_number: 'A1', matches: [] }] });
  await click('Check');
  expect(api.checkMatches).toHaveBeenCalledWith('7', [{ id: 11, part_number: 'A1' }]);
  expect(view.container.textContent).toContain('New part');
});

test('check sends the typed part number without saving', async () => {
  await mount();
  const input = view.container.querySelector('#review-11-part_number');
  await act(async () => {
    Simulate.change(input, { target: { value: 'ZZ9' } });
  });
  api.checkMatches.mockResolvedValue({ ok: true, data: [{ line_id: 11, part_number: 'ZZ9', matches: [] }] });
  await click('Check');
  expect(api.checkMatches).toHaveBeenCalledWith('7', [{ id: 11, part_number: 'ZZ9' }]);
  expect(api.saveReview).not.toHaveBeenCalled();
});

test('create job blocks with line errors when part number, quantity or price is missing', async () => {
  await mount(review({ lines: [line({ part_number: '' }), line({ id: 12, quantity: 0 }), line({ id: 13, price: '' })] }));
  await click('Create job');
  expect(api.saveReview).not.toHaveBeenCalled();
  expect(api.createJob).not.toHaveBeenCalled();
  expect(view.container.querySelectorAll('.review-error').length).toBe(3);
});

test('create job saves, creates the job and navigates to it', async () => {
  await mount();
  api.saveReview.mockResolvedValue({ ok: true, data: review() });
  api.createJob.mockResolvedValue({ ok: true, data: { id: 42, job_number: 'J42' } });
  await click('Create job');
  expect(api.saveReview).toHaveBeenCalledTimes(1);
  expect(api.createJob).toHaveBeenCalledWith('7');
  expect(mockNavigate).toHaveBeenCalledWith('/job/42');
});

test('shows an invalid error message and does not create a job when save fails', async () => {
  await mount();
  api.saveReview.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Quantity too big' } });
  await click('Create job');
  expect(view.container.textContent).toContain('Quantity too big');
  expect(api.createJob).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('job_created request is read-only with a job link and no action buttons', async () => {
  await mount(review({ status: 'job_created', job_id: 42 }));
  expect(button('Save')).toBeUndefined();
  expect(button('Check')).toBeUndefined();
  expect(button('Create job')).toBeUndefined();
  expect(view.container.querySelector('#review-11-part_number').tagName).toBe('SPAN');
  expect(view.container.querySelector('a[href="/job/42"]')).toBeTruthy();
});

test('opening a file fetches its url and opens it', async () => {
  await mount();
  api.fetchRequestFileUrl.mockResolvedValue({ ok: true, url: 'blob:x' });
  await click('spec.pdf');
  expect(api.fetchRequestFileUrl).toHaveBeenCalledWith('7', 3);
  expect(window.open).toHaveBeenCalledWith('blob:x');
});

test('opening a part drawing resolves its admin url and opens it', async () => {
  const drawing = { id: 9, filename: 'part.pdf' };
  await mount(review({ lines: [line({ part_files: [drawing] })] }));
  fetchAdminDrawingUrl.mockResolvedValue({ ok: true, url: 'blob:d' });
  await click('part.pdf');
  expect(fetchAdminDrawingUrl).toHaveBeenCalledWith(drawing);
  expect(window.open).toHaveBeenCalledWith('blob:d');
});

test('a failed drawing fetch shows its message', async () => {
  await mount(review({ lines: [line({ part_files: [{ id: 9, filename: 'part.pdf' }] })] }));
  fetchAdminDrawingUrl.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'No drawing' } });
  await click('part.pdf');
  expect(window.open).not.toHaveBeenCalled();
  expect(view.container.textContent).toContain('No drawing');
});

describe('remove line', () => {
  const two = () => review({ lines: [line(), line({ id: 12, part_number: 'B2' })] });

  test('confirmed removal applies the returned review and clears that line state', async () => {
    await mount(two());
    api.checkMatches.mockResolvedValue({
      ok: true,
      data: [{ line_id: 11, matches: [] }, { line_id: 12, matches: [] }],
    });
    await click('Check');
    expect(view.container.textContent).toContain('New part');
    window.confirm = jest.fn(() => true);
    api.removeLine.mockResolvedValue({ ok: true, data: review({ lines: [line({ id: 12, part_number: 'B2' })] }) });
    const removes = [...view.container.querySelectorAll('button')].filter((b) => b.textContent === 'Remove line');
    await act(async () => { removes[0].click(); });
    expect(window.confirm).toHaveBeenCalledWith('Remove this line from the request?');
    expect(api.removeLine).toHaveBeenCalledWith('7', 11);
    expect(view.container.querySelector('#review-11-part_number')).toBeNull();
    expect(view.container.querySelector('#review-12-part_number').value).toBe('B2');
    expect(view.container.textContent).toContain('New part');
  });

  test('removal keeps an unsaved edit typed into another line', async () => {
    await mount(two());
    const input = view.container.querySelector('#review-12-description');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(input, 'typed');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    window.confirm = jest.fn(() => true);
    api.removeLine.mockResolvedValue({
      ok: true,
      data: review({ name: 'Renamed', lines: [line({ id: 12, part_number: 'B2', description: 'server' })] }),
    });
    const removes = [...view.container.querySelectorAll('button')].filter((b) => b.textContent === 'Remove line');
    await act(async () => { removes[0].click(); });
    expect(view.container.querySelector('#review-11-part_number')).toBeNull();
    expect(view.container.querySelector('#review-12-description').value).toBe('typed');
    expect(view.container.textContent).toContain('Renamed');
  });

  test('declined confirmation does not call removeLine', async () => {
    await mount();
    window.confirm = jest.fn(() => false);
    await click('Remove line');
    expect(api.removeLine).not.toHaveBeenCalled();
    expect(view.container.querySelector('#review-11-part_number')).toBeTruthy();
  });

  test('a failed removal shows its message and keeps the line', async () => {
    await mount();
    window.confirm = jest.fn(() => true);
    api.removeLine.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Cannot remove' } });
    await click('Remove line');
    expect(view.container.textContent).toContain('Cannot remove');
    expect(view.container.querySelector('#review-11-part_number')).toBeTruthy();
  });

  test('job_created review has no Remove line button', async () => {
    await mount(review({ status: 'job_created', job_id: 42 }));
    expect(button('Remove line')).toBeUndefined();
  });
});

describe('fill from a check result', () => {
  const two = () => review({ lines: [line(), line({ id: 12, part_number: 'B2', description: 'other' })] });
  const m = (id, number) => ({ id, number, description: 'desc ' + number, match: 'join', history: [] });
  const checkAll = async () => {
    api.checkMatches.mockResolvedValue({
      ok: true,
      data: [{ line_id: 11, matches: [m(3, 'A1-X')] }, { line_id: 12, matches: [m(4, 'B2-Y')] }],
    });
    await click('Check');
    api.checkMatches.mockClear();
  };

  test('fills one line, rechecks only that line and replaces only its matches', async () => {
    await mount(two());
    await checkAll();
    api.checkMatches.mockResolvedValue({ ok: true, data: [{ line_id: 11, matches: [] }] });
    await act(async () => { [...view.container.querySelectorAll('.review-match button')][0].click(); });
    expect(view.container.querySelector('#review-11-part_number').value).toBe('A1-X');
    expect(view.container.querySelector('#review-11-description').value).toBe('desc A1-X');
    expect(view.container.querySelector('#review-12-part_number').value).toBe('B2');
    expect(api.checkMatches).toHaveBeenCalledTimes(1);
    expect(api.checkMatches).toHaveBeenCalledWith('7', [{ id: 11, part_number: 'A1-X' }]);
    expect(api.saveReview).not.toHaveBeenCalled();
    const text = view.container.textContent;
    expect(text).toContain('New part');
    expect(text).toContain('B2-Y');
  });

  test('shows the error message when the recheck fails', async () => {
    await mount(two());
    await checkAll();
    api.checkMatches.mockResolvedValue({ ok: false, error: { message: 'Check broke' } });
    await act(async () => { view.container.querySelector('.review-match button').click(); });
    expect(view.container.textContent).toContain('Check broke');
    expect(api.saveReview).not.toHaveBeenCalled();
  });
});

describe('lazy PDF previews', () => {
  const PDF = { id: 4, filename: 'dwg.pdf', mimetype: 'application/pdf' };
  const DWG = { id: 9, filename: 'part.pdf', mimetype: 'application/pdf' };
  let observers;
  let originalObserver;

  beforeEach(() => {
    observers = [];
    originalObserver = window.IntersectionObserver;
    window.IntersectionObserver = jest.fn(function Observer(callback) {
      this.observe = jest.fn();
      this.disconnect = jest.fn();
      this.callback = callback;
      observers.push(this);
    });
    global.URL.revokeObjectURL = jest.fn();
  });
  afterEach(() => { window.IntersectionObserver = originalObserver; });

  const intersect = async (index) => {
    await act(async () => { observers[index].callback([{ isIntersecting: true }]); });
  };
  const withFiles = () => review({
    files: [{ id: 3, filename: 'spec.pdf', mimetype: 'application/pdf' }],
    lines: [line({ files: [PDF, { id: 5, filename: 'm.step', mimetype: 'x/step' }], part_files: [DWG] })],
  });

  test('loading alone fetches nothing and never previews request-level or non-PDF files', async () => {
    await mount(withFiles());
    expect(observers).toHaveLength(2);
    expect(api.fetchRequestFileUrl).not.toHaveBeenCalled();
    expect(fetchAdminDrawingUrl).not.toHaveBeenCalled();
  });

  test('intersecting fetches each PDF once and shows its thumbnail', async () => {
    await mount(withFiles());
    api.fetchRequestFileUrl.mockResolvedValue({ ok: true, url: 'blob:l' });
    fetchAdminDrawingUrl.mockResolvedValue({ ok: true, url: 'blob:p' });
    await intersect(0);
    await intersect(1);
    expect(api.fetchRequestFileUrl).toHaveBeenCalledWith('7', 4);
    expect(fetchAdminDrawingUrl).toHaveBeenCalledWith(DWG);
    const urls = [...view.container.querySelectorAll('.thumb')].map((t) => t.dataset.url);
    expect(urls).toEqual(['blob:l', 'blob:p']);
    await intersect(0);
    expect(api.fetchRequestFileUrl).toHaveBeenCalledTimes(1);
  });

  test('clicking a preview opens its url in a focused new tab', async () => {
    await mount(withFiles());
    const tab = { focus: jest.fn() };
    window.open.mockReturnValue(tab);
    api.fetchRequestFileUrl.mockResolvedValue({ ok: true, url: 'blob:l' });
    await intersect(0);
    await act(async () => { view.container.querySelector('.thumb').click(); });
    expect(window.open).toHaveBeenCalledWith('blob:l', '_blank');
    expect(tab.focus).toHaveBeenCalled();
    expect(api.fetchRequestFileUrl).toHaveBeenCalledTimes(1);
  });

  test('a failed fetch falls back to the filename button and is not retried', async () => {
    await mount(withFiles());
    api.fetchRequestFileUrl.mockResolvedValue({ ok: false, error: { message: 'nope' } });
    await intersect(0);
    expect(button('dwg.pdf')).toBeTruthy();
    expect(view.container.querySelector('.thumb')).toBeNull();
    expect(view.container.textContent).not.toContain('nope');
    await intersect(0);
    expect(api.fetchRequestFileUrl).toHaveBeenCalledTimes(1);
  });

  test('revokes every blob url on unmount', async () => {
    await mount(withFiles());
    api.fetchRequestFileUrl.mockResolvedValue({ ok: true, url: 'blob:l' });
    fetchAdminDrawingUrl.mockResolvedValue({ ok: true, url: 'blob:p' });
    await intersect(0);
    await intersect(1);
    view.unmount();
    view = null;
    expect(global.URL.revokeObjectURL.mock.calls.map((c) => c[0]).sort()).toEqual(['blob:l', 'blob:p']);
  });
});
