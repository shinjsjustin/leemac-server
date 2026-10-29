import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientRequestPage from './ClientRequestPage';
import {
  getRequest, createRequest, saveRequest, submitRequest, uploadLineFiles, removeRequestFile, uploadRequestFiles,
  listRequests,
} from '../../api/portalRequestsApi';
import RequestGrid from './RequestGrid';
import { listLists } from '../../api/portalListsApi';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));
jest.mock('../../api/portalRequestsApi', () => ({
  ...jest.requireActual('../../api/portalRequestsApi'),
  getRequest: jest.fn(),
  createRequest: jest.fn(),
  saveRequest: jest.fn(),
  submitRequest: jest.fn(),
  uploadLineFiles: jest.fn(),
  removeRequestFile: jest.fn(),
  uploadRequestFiles: jest.fn(),
  listRequests: jest.fn(),
}));
jest.mock('./RequestGrid', () => {
  const actual = jest.requireActual('./RequestGrid');
  const spy = (props) => { spy.lastProps = props; return actual.default(props); };
  return { __esModule: true, ...actual, default: spy };
});
jest.mock('../../api/portalListsApi', () => ({ listLists: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data) => ({ ok: true, data });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  await flush();
};
const buttonByText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);
const submitButton = (c) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith('Submit request'));
const footerText = (c) => c.querySelector('.portal-req-footer').textContent;
const drop = (el, files) => act(() => {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  event.dataTransfer = { files };
  el.dispatchEvent(event);
});
const attach = (input, file) => act(() => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
const byLabel = (c, label) => c.querySelector(`input[aria-label="${label}"]`);
const requestFileLists = (c) => [...c.querySelectorAll('ul.portal-request-files')].filter((ul) => !ul.closest('.portal-request-row'));
const rowEls = (c) => [...c.querySelectorAll('.portal-request-row')];
const field = (row, label) => [...row.querySelectorAll('label')].find((l) => l.textContent.startsWith(label));
const fill = (row, label, value) => type(row.querySelector(`#${field(row, label).htmlFor}`), value);

const line = (id, over = {}) => ({
  id, part_number: `PN-${id}`, description: null, rev: null, material: null, finish: null,
  quantity: 2, files: [], ...over,
});
const request = (over = {}) => ({
  id: 5, name: 'Spring order', need_by: '2026-12-01', note: 'Hi', status: 'draft', lines: [line(11)], files: [], ...over,
});

let view;
const mount = async (id) => {
  view = id
    ? render(<ClientRequestPage />, { path: `/client-request/${id}`, route: '/client-request/:id' })
    : render(<ClientRequestPage />, { path: '/client-request' });
  await flush();
  return view.container;
};

beforeEach(() => {
  [mockNavigate, getRequest, createRequest, saveRequest, submitRequest, uploadLineFiles, removeRequestFile, uploadRequestFiles,
    listRequests, listLists].forEach((m) => m.mockReset());
  listRequests.mockResolvedValue(ok([]));
  listLists.mockResolvedValue(ok([]));
  uploadLineFiles.mockResolvedValue(ok({ ids: [1] }));
  removeRequestFile.mockResolvedValue(ok({ ok: true }));
  uploadRequestFiles.mockResolvedValue(ok({ ids: [1] }));
});
afterEach(() => view && view.unmount());

describe('ClientRequestPage new list', () => {
  it('starts with a one-row header and 10 empty rows', async () => {
    const c = await mount();
    const title = byLabel(c, 'List title');
    expect(title.placeholder).toBe('Untitled List');
    expect(title.classList.contains('portal-request-title')).toBe(true);
    const header = c.querySelector('.portal-request-header');
    expect(header.querySelector('#request-need-by').type).toBe('date');
    expect(header.querySelector('#request-note')).not.toBeNull();
    expect(rowEls(c)).toHaveLength(10);
    expect(getRequest).not.toHaveBeenCalled();
  });

  it('shows Save draft and Submit request once each in the sticky footer and no whole-list files', async () => {
    const c = await mount();
    const footer = c.querySelector('.portal-req-footer');
    const all = [...c.querySelectorAll('button')];
    const save = all.filter((b) => b.textContent === 'Save draft');
    const submit = all.filter((b) => b.textContent.startsWith('Submit request'));
    expect(save).toHaveLength(1);
    expect(submit).toHaveLength(1);
    expect(footer.contains(save[0])).toBe(true);
    expect(footer.contains(submit[0])).toBe(true);
    expect(c.querySelector('.portal-request-header').contains(save[0])).toBe(false);
    expect(c.textContent).not.toContain('Files for the whole list');
    expect(c.querySelector('#request-files')).toBeNull();
  });

  it('puts title, Draft tag, Need by and Note on one header line', async () => {
    const c = await mount();
    const header = c.querySelector('.portal-request-header');
    expect(header.querySelector('.portal-req-tag').textContent).toBe('Draft');
    expect(header.contains(c.querySelector('#request-need-by'))).toBe(true);
    expect(header.contains(c.querySelector('#request-note'))).toBe(true);
    expect(header.closest('.portal-title-row').contains(byLabel(c, 'List title'))).toBe(true);
  });

  it('gives the back link the portal-back-link class', async () => {
    const c = await mount();
    const back = [...c.querySelectorAll('a')].find((a) => a.textContent === 'Back to your requests');
    expect(back.classList.contains('portal-back-link')).toBe(true);
  });

  it('creates with header and non-empty rows, uploads files to returned line ids, then opens the draft', async () => {
    createRequest.mockResolvedValue(ok({ id: 5 }));
    getRequest.mockResolvedValue(ok(request({ lines: [line(21), line(22)] })));
    const c = await mount();
    type(byLabel(c, 'List title'), 'Spring order');
    type(c.querySelector('#request-need-by'), '2026-12-01');
    type(c.querySelector('#request-note'), 'Hi');
    const rows = rowEls(c);
    fill(rows[1], 'Part name', 'A1');
    fill(rows[1], 'Quantity', '3');
    fill(rows[4], 'Description', 'Bolt');
    fill(rows[4], 'Quantity', '7');
    const file = new File(['x'], 'a.pdf');
    attach(rows[4].querySelector('input[type="file"]'), file);

    await click(buttonByText(c, 'Save draft'));

    expect(createRequest).toHaveBeenCalledTimes(1);
    const body = createRequest.mock.calls[0][0];
    expect(body).toMatchObject({ name: 'Spring order', need_by: '2026-12-01', note: 'Hi' });
    expect(body.lines.map((l) => [l.part_number, l.description, l.quantity])).toEqual([
      ['A1', '', '3'], ['', 'Bolt', '7'],
    ]);
    expect(uploadLineFiles).toHaveBeenCalledTimes(1);
    expect(uploadLineFiles).toHaveBeenCalledWith(5, 22, [file]);
    expect(mockNavigate).toHaveBeenCalledWith('/client-request/5');
  });

  it('saves a file-only row as a draft with has_files true and uploads to the returned line id', async () => {
    createRequest.mockResolvedValue(ok({ id: 5 }));
    getRequest.mockResolvedValue(ok(request({ lines: [line(31, { part_number: null, quantity: null })] })));
    const c = await mount();
    const file = new File(['x'], 'a.pdf');
    attach(rowEls(c)[0].querySelector('input[type="file"]'), file);
    await click(buttonByText(c, 'Save draft'));
    expect(createRequest).toHaveBeenCalledTimes(1);
    const { lines } = createRequest.mock.calls[0][0];
    expect(lines).toHaveLength(1);
    expect(lines[0].has_files).toBe(true);
    expect(uploadLineFiles).toHaveBeenCalledWith(5, 31, [file]);
  });

  it('submits a row with a file and quantity 1 but no text', async () => {
    createRequest.mockResolvedValue(ok({ id: 5 }));
    getRequest.mockResolvedValue(ok(request({ lines: [line(31, { part_number: null, quantity: 1 })] })));
    submitRequest.mockResolvedValue(ok(request({ status: 'sent' })));
    const c = await mount();
    attach(rowEls(c)[0].querySelector('input[type="file"]'), new File(['x'], 'a.pdf'));
    fill(rowEls(c)[0], 'Quantity', '1');
    await click(submitButton(c));
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(submitRequest).toHaveBeenCalledWith(5);
    expect(mockNavigate).toHaveBeenCalledWith('/client-requests');
  });

  it('blocks Submit on a file-only row with the quantity message and no API call', async () => {
    const c = await mount();
    attach(rowEls(c)[0].querySelector('input[type="file"]'), new File(['x'], 'a.pdf'));
    await click(submitButton(c));
    expect(rowEls(c)[0].querySelector('[role="alert"]').textContent).toContain('Each row needs a quantity of at least 1.');
    expect(createRequest).not.toHaveBeenCalled();
    expect(submitRequest).not.toHaveBeenCalled();
  });

  it('shows an invalid API error message', async () => {
    createRequest.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Name is too long.' } });
    const c = await mount();
    fill(rowEls(c)[0], 'Part name', 'A');
    await click(buttonByText(c, 'Save draft'));
    expect(c.querySelector('[role="alert"]').textContent).toContain('Name is too long.');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('blocks Submit on a row missing quantity with a row error and no API call', async () => {
    const c = await mount();
    fill(rowEls(c)[0], 'Part name', 'A');
    await click(submitButton(c));
    expect(rowEls(c)[0].querySelector('[role="alert"]')).not.toBeNull();
    expect(createRequest).not.toHaveBeenCalled();
    expect(submitRequest).not.toHaveBeenCalled();
  });

  it('saves then submits and goes to the list', async () => {
    createRequest.mockResolvedValue(ok({ id: 5 }));
    getRequest.mockResolvedValue(ok(request()));
    submitRequest.mockResolvedValue(ok(request({ status: 'sent' })));
    const c = await mount();
    fill(rowEls(c)[0], 'Part name', 'A');
    fill(rowEls(c)[0], 'Quantity', '1');
    await click(submitButton(c));
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(submitRequest).toHaveBeenCalledWith(5);
    expect(mockNavigate).toHaveBeenCalledWith('/client-requests');
    expect(mockNavigate).not.toHaveBeenCalledWith('/client-request/5');
  });
});

describe('ClientRequestPage draft', () => {
  it('loads a draft, pads to 10 rows and uses the request name as title', async () => {
    getRequest.mockResolvedValue(ok(request()));
    const c = await mount(5);
    expect(getRequest).toHaveBeenCalledWith('5');
    expect(byLabel(c, 'List title').value).toBe('Spring order');
    expect(rowEls(c)).toHaveLength(10);
    expect(c.querySelector('#request-need-by').value).toBe('2026-12-01');
  });

  it('saves with saved row ids and removes files the user removed', async () => {
    const files = [{ id: 31, filename: 'a.pdf', mimetype: 'x', size: 1 }, { id: 32, filename: 'b.step', mimetype: 'x', size: 1 }];
    getRequest.mockResolvedValue(ok(request({ lines: [line(11, { files })] })));
    saveRequest.mockResolvedValue(ok(request()));
    const c = await mount(5);
    await click(c.querySelector('button[aria-label="Remove a.pdf"]'));
    await click(buttonByText(c, 'Save draft'));
    expect(saveRequest).toHaveBeenCalledTimes(1);
    expect(saveRequest.mock.calls[0][0]).toBe('5');
    expect(saveRequest.mock.calls[0][1].lines.map((l) => l.id)).toEqual([11]);
    expect(removeRequestFile).toHaveBeenCalledTimes(1);
    expect(removeRequestFile).toHaveBeenCalledWith('5', 31);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it('does not remove files of a line the user emptied out', async () => {
    const files = [{ id: 31, filename: 'a.pdf', mimetype: 'x', size: 1 }];
    getRequest.mockResolvedValue(ok(request({ lines: [line(11, { files }), line(12)] })));
    saveRequest.mockResolvedValue(ok(request()));
    const c = await mount(5);
    await click(c.querySelector('button[aria-label="Remove a.pdf"]'));
    const first = rowEls(c)[0];
    fill(first, 'Part name', '');
    fill(first, 'Quantity', '');
    await click(buttonByText(c, 'Save draft'));
    expect(saveRequest.mock.calls[0][1].lines.map((l) => l.id)).toEqual([12]);
    expect(removeRequestFile).not.toHaveBeenCalled();
  });
});

describe('ClientRequestPage partial failure and request-level files', () => {
  const stored = (id, name) => ({ id, filename: name, mimetype: 'x', size: 1 });
  const failure = { ok: false, error: { kind: 'invalid', message: 'Nope.' } };

  it('retries only the second row upload after it failed', async () => {
    getRequest.mockResolvedValue(ok(request({ lines: [line(11), line(12)] })));
    saveRequest.mockResolvedValue(ok(request({ lines: [line(11), line(12)] })));
    const c = await mount(5);
    const f1 = new File(['x'], 'a.pdf');
    const f2 = new File(['y'], 'b.pdf');
    attach(rowEls(c)[0].querySelector('input[type="file"]'), f1);
    attach(rowEls(c)[1].querySelector('input[type="file"]'), f2);
    uploadLineFiles.mockResolvedValueOnce(ok({ ids: [1] })).mockResolvedValueOnce(failure);
    await click(buttonByText(c, 'Save draft'));
    expect(uploadLineFiles).toHaveBeenCalledTimes(2);
    uploadLineFiles.mockClear();
    await click(buttonByText(c, 'Save draft'));
    expect(uploadLineFiles).toHaveBeenCalledTimes(1);
    expect(uploadLineFiles).toHaveBeenCalledWith('5', 12, [f2]);
  });

  it('retries only the second removal after it failed', async () => {
    const l1 = line(11, { files: [stored(31, 'a.pdf')] });
    const l2 = line(12, { files: [stored(32, 'b.pdf')] });
    getRequest.mockResolvedValue(ok(request({ lines: [l1, l2] })));
    saveRequest.mockResolvedValue(ok(request({ lines: [l1, l2] })));
    const c = await mount(5);
    await click(c.querySelector('button[aria-label="Remove a.pdf"]'));
    await click(c.querySelector('button[aria-label="Remove b.pdf"]'));
    removeRequestFile.mockResolvedValueOnce(ok({ ok: true })).mockResolvedValueOnce(failure);
    await click(buttonByText(c, 'Save draft'));
    expect(removeRequestFile).toHaveBeenCalledTimes(2);
    removeRequestFile.mockClear();
    await click(buttonByText(c, 'Save draft'));
    expect(removeRequestFile).toHaveBeenCalledTimes(1);
    expect(removeRequestFile).toHaveBeenCalledWith('5', 32);
  });

  it('counts a not_found removal as removed and saves', async () => {
    const l1 = line(11, { files: [stored(31, 'a.pdf')] });
    getRequest.mockResolvedValue(ok(request({ lines: [l1] })));
    saveRequest.mockResolvedValue(ok(request({ lines: [line(11)] })));
    removeRequestFile.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'Gone.' } });
    const c = await mount(5);
    await click(c.querySelector('button[aria-label="Remove a.pdf"]'));
    await click(buttonByText(c, 'Save draft'));
    expect(c.querySelector('[role="alert"]')).toBeNull();
    expect(c.querySelector('[role="status"]').textContent).toBe('Saved');
  });

  it('lists a draft\'s request files each with a Remove button', async () => {
    getRequest.mockResolvedValue(ok(request({ files: [stored(41, 'whole.pdf'), stored(42, 'other.step')] })));
    const c = await mount(5);
    const items = requestFileLists(c).flatMap((ul) => [...ul.querySelectorAll('li')]);
    expect(items.map((li) => li.textContent.replace('Remove', ''))).toEqual(expect.arrayContaining(['whole.pdf', 'other.step']));
    expect(c.querySelector('button[aria-label="Remove whole.pdf"]')).not.toBeNull();
    expect(c.querySelector('button[aria-label="Remove other.step"]')).not.toBeNull();
  });

  it('removes a request file only after Remove then Save', async () => {
    const withFiles = request({ files: [stored(41, 'whole.pdf'), stored(42, 'other.step')] });
    getRequest.mockResolvedValue(ok(withFiles));
    saveRequest.mockResolvedValue(ok(withFiles));
    const c = await mount(5);
    await click(buttonByText(c, 'Save draft'));
    expect(removeRequestFile).not.toHaveBeenCalled();
    await click(c.querySelector('button[aria-label="Remove whole.pdf"]'));
    expect(c.textContent).not.toContain('whole.pdf');
    await click(buttonByText(c, 'Save draft'));
    expect(removeRequestFile).toHaveBeenCalledTimes(1);
    expect(removeRequestFile).toHaveBeenCalledWith('5', 41);
    expect(uploadRequestFiles).not.toHaveBeenCalled();
  });

  it('renders no request file list or file input for a draft without request files', async () => {
    getRequest.mockResolvedValue(ok(request()));
    const c = await mount(5);
    expect(requestFileLists(c)).toHaveLength(0);
    expect(c.querySelector('#request-files')).toBeNull();
    expect(c.textContent).not.toContain('Files for the whole list');
  });

  it('lists request files by name only when read-only', async () => {
    getRequest.mockResolvedValue(ok(request({ status: 'sent', files: [stored(41, 'whole.pdf')] })));
    const c = await mount(5);
    expect(c.textContent).toContain('whole.pdf');
    expect(c.querySelector('button[aria-label="Remove whole.pdf"]')).toBeNull();
    expect(c.querySelector('input[type="file"]#request-files')).toBeNull();
  });
});

describe('ClientRequestPage read-only', () => {
  it('renders a non-draft request read-only with its status label and no buttons', async () => {
    getRequest.mockResolvedValue(ok(request({ status: 'in_review' })));
    const c = await mount(5);
    expect(c.querySelector('.portal-req-tag').textContent).toBe('In review');
    expect(c.querySelector('.portal-req-footer')).toBeNull();
    expect(c.querySelector('.portal-req-drop')).toBeNull();
    expect(c.querySelector('h1').textContent).toBe('Spring order');
    expect(c.querySelector('.portal-request-header').textContent).toContain('2026-12-01');
    expect(buttonByText(c, 'Save draft')).toBeUndefined();
    expect(submitButton(c)).toBeUndefined();
    expect(c.querySelectorAll('input')).toHaveLength(0);
    expect(rowEls(c)).toHaveLength(1);
  });

  it('shows a load failure with PortalMessage', async () => {
    getRequest.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'Not found.' } });
    const c = await mount(5);
    expect(c.querySelector('.portal-message')).not.toBeNull();
    expect(buttonByText(c, 'Save draft')).toBeUndefined();
  });
});

describe('ClientRequestPage part_files', () => {
  const drawing = { id: 7, filename: 'bracket.pdf' };

  it('shows a line\'s part_files on its row and never sends them in a save body', async () => {
    getRequest.mockResolvedValue(ok(request({ lines: [line(11, { part_files: [drawing] }), line(12)] })));
    saveRequest.mockResolvedValue(ok(request({ lines: [line(11), line(12)] })));
    const c = await mount(5);
    const [first, second] = rowEls(c);
    expect(first.textContent).toContain('On file');
    expect(first.textContent).toContain('bracket.pdf');
    expect(second.textContent).not.toContain('On file');
    await click(buttonByText(c, 'Save draft'));
    const body = saveRequest.mock.calls[0][1];
    expect(body.lines).toHaveLength(2);
    expect(Object.keys(body.lines[0]).sort()).toEqual(
      ['description', 'finish', 'has_files', 'id', 'material', 'part_number', 'quantity', 'rev'],
    );
  });

  it('maps source_part_id onto the row but never sends it', async () => {
    getRequest.mockResolvedValue(ok(request({ lines: [line(11, { source_part_id: 9, part_number: 'HSX' })] })));
    saveRequest.mockResolvedValue(ok(request({ lines: [line(11)] })));
    const c = await mount(5);
    expect(rowEls(c)[0].textContent).toContain('From your part HSX');
    await click(buttonByText(c, 'Save draft'));
    expect(saveRequest.mock.calls[0][1].lines[0]).not.toHaveProperty('source_part_id');
  });
});

describe('ClientRequestPage rail', () => {
  it('shows the rail with the open request current', async () => {
    listRequests.mockResolvedValue(ok([
      { id: 5, name: 'Spring order', status: 'draft', updated_at: '2026-10-01T00:00:00Z' },
      { id: 6, name: 'Other', status: 'draft', updated_at: '2026-10-01T00:00:00Z' },
    ]));
    getRequest.mockResolvedValue(ok(request()));
    const c = await mount(5);
    const rows = [...c.querySelectorAll('.portal-req-rail .portal-req-row')];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.getAttribute('aria-current'))).toEqual(['page', null]);
  });

  it('hides only the rail when listRequests fails', async () => {
    listRequests.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'No' } });
    const c = await mount();
    expect(c.querySelector('.portal-req-rail')).toBeNull();
    expect(rowEls(c)).toHaveLength(10);
  });

  it('keeps the rail without lists when listLists fails', async () => {
    listLists.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'No' } });
    const c = await mount();
    expect(c.querySelector('.portal-req-rail')).not.toBeNull();
  });
});

describe('ClientRequestPage drop strip and footer', () => {
  const pdf = (n) => new File(['x'], n, { type: 'application/pdf' });
  const step = (n) => new File(['x'], n);
  const strip = (c) => c.querySelector('.portal-req-drop');

  it('pairs a PDF and STEP with the same base name into one row, others in their own', async () => {
    const c = await mount();
    const files = [pdf('Bracket.pdf'), step('bracket.STEP'), pdf('lid.pdf')];
    drop(strip(c), files);
    const rows = rowEls(c);
    expect(rows).toHaveLength(10);
    expect(rows[0].textContent).toContain('Bracket.pdf');
    expect(rows[0].textContent).toContain('bracket.STEP');
    expect(rows[0].textContent).not.toContain('lid.pdf');
    expect(rows[1].textContent).toContain('lid.pdf');
    expect(rows[2].textContent).not.toContain('.pdf');
  });

  it('fills empty rows first and appends rows after the last one', async () => {
    const c = await mount();
    fill(rowEls(c)[0], 'Part name', 'Existing');
    const files = Array.from({ length: 10 }, (_, i) => pdf(`p${i}.pdf`));
    drop(strip(c), files);
    const rows = rowEls(c);
    expect(rows).toHaveLength(11);
    expect(rows[0].textContent).not.toContain('p0.pdf');
    expect(rows[1].textContent).toContain('p0.pdf');
    expect(rows[10].textContent).toContain('p9.pdf');
  });

  it('turns files chosen with Browse files into rows', async () => {
    const c = await mount();
    attach(strip(c).querySelector('input[type="file"]'), pdf('a.pdf'));
    expect(rowEls(c)[0].textContent).toContain('a.pdf');
  });

  it('counts lines, lines with a quantity and missing files in the footer', async () => {
    const c = await mount();
    expect(footerText(c)).toContain('0 lines');
    expect(submitButton(c).textContent).toBe('Submit request \u00b7 0 lines');
    drop(strip(c), [pdf('a.pdf'), step('a.step'), pdf('b.pdf')]);
    fill(rowEls(c)[0], 'Quantity', '2');
    expect(footerText(c)).toContain('2 lines');
    expect(footerText(c)).toContain('1 with quantity');
    expect(footerText(c)).toContain('1 missing files');
    expect(submitButton(c).textContent).toBe('Submit request \u00b7 1 lines');
  });
});

describe('ClientRequestPage grid', () => {
  it('passes the request id to RequestGrid once the request loads', async () => {
    getRequest.mockResolvedValue(ok(request()));
    await mount(5);
    expect(RequestGrid.lastProps.requestId).toBe(5);
  });
});
