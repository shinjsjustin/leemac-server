import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientRequestPage from './ClientRequestPage';
import {
  getRequest, createRequest, saveRequest, submitRequest, uploadLineFiles, removeRequestFile,
} from '../../api/portalRequestsApi';

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
}));

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
const attach = (input, file) => act(() => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
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
  [mockNavigate, getRequest, createRequest, saveRequest, submitRequest, uploadLineFiles, removeRequestFile]
    .forEach((m) => m.mockReset());
  uploadLineFiles.mockResolvedValue(ok({ ids: [1] }));
  removeRequestFile.mockResolvedValue(ok({ ok: true }));
});
afterEach(() => view && view.unmount());

describe('ClientRequestPage new list', () => {
  it('starts with a titled layout and 10 empty rows', async () => {
    const c = await mount();
    expect(c.querySelector('h1').textContent).toBe('Quick New Parts List');
    expect(rowEls(c)).toHaveLength(10);
    expect(getRequest).not.toHaveBeenCalled();
  });

  it('creates with header and non-empty rows, uploads files to returned line ids, then opens the draft', async () => {
    createRequest.mockResolvedValue(ok({ id: 5 }));
    getRequest.mockResolvedValue(ok(request({ lines: [line(21), line(22)] })));
    const c = await mount();
    type(c.querySelector('#request-name'), 'Spring order');
    type(c.querySelector('#request-need-by'), '2026-12-01');
    type(c.querySelector('#request-note'), 'Hi');
    const rows = rowEls(c);
    fill(rows[1], 'Part number', 'A1');
    fill(rows[1], 'Quantity', '3');
    fill(rows[4], 'Description', 'Bolt');
    fill(rows[4], 'Quantity', '7');
    const file = new File(['x'], 'a.pdf');
    attach(rows[4].querySelector('input[type="file"]'), file);

    await click(buttonByText(c, 'Save'));

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

  it('blocks Save on a row with files but no text or quantity', async () => {
    const c = await mount();
    attach(rowEls(c)[0].querySelector('input[type="file"]'), new File(['x'], 'a.pdf'));
    await click(buttonByText(c, 'Save'));
    expect(createRequest).not.toHaveBeenCalled();
    expect(rowEls(c)[0].querySelector('[role="alert"]')).not.toBeNull();
  });

  it('shows an invalid API error message', async () => {
    createRequest.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'Name is too long.' } });
    const c = await mount();
    fill(rowEls(c)[0], 'Part number', 'A');
    await click(buttonByText(c, 'Save'));
    expect(c.querySelector('[role="alert"]').textContent).toContain('Name is too long.');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('blocks Submit on a row missing quantity with a row error and no API call', async () => {
    const c = await mount();
    fill(rowEls(c)[0], 'Part number', 'A');
    await click(buttonByText(c, 'Submit'));
    expect(rowEls(c)[0].querySelector('[role="alert"]')).not.toBeNull();
    expect(createRequest).not.toHaveBeenCalled();
    expect(submitRequest).not.toHaveBeenCalled();
  });

  it('saves then submits and goes to the list', async () => {
    createRequest.mockResolvedValue(ok({ id: 5 }));
    getRequest.mockResolvedValue(ok(request()));
    submitRequest.mockResolvedValue(ok(request({ status: 'sent' })));
    const c = await mount();
    fill(rowEls(c)[0], 'Part number', 'A');
    fill(rowEls(c)[0], 'Quantity', '1');
    await click(buttonByText(c, 'Submit'));
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
    expect(c.querySelector('h1').textContent).toBe('Spring order');
    expect(rowEls(c)).toHaveLength(10);
    expect(c.querySelector('#request-need-by').value).toBe('2026-12-01');
  });

  it('saves with saved row ids and removes files the user removed', async () => {
    const files = [{ id: 31, filename: 'a.pdf', mimetype: 'x', size: 1 }, { id: 32, filename: 'b.step', mimetype: 'x', size: 1 }];
    getRequest.mockResolvedValue(ok(request({ lines: [line(11, { files })] })));
    saveRequest.mockResolvedValue(ok(request()));
    const c = await mount(5);
    await click(c.querySelector('button[aria-label="Remove a.pdf"]'));
    await click(buttonByText(c, 'Save'));
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
    fill(first, 'Part number', '');
    fill(first, 'Quantity', '');
    await click(buttonByText(c, 'Save'));
    expect(saveRequest.mock.calls[0][1].lines.map((l) => l.id)).toEqual([12]);
    expect(removeRequestFile).not.toHaveBeenCalled();
  });
});

describe('ClientRequestPage read-only', () => {
  it('renders a non-draft request read-only with its status label and no buttons', async () => {
    getRequest.mockResolvedValue(ok(request({ status: 'in_review' })));
    const c = await mount(5);
    expect(c.textContent).toContain('In review');
    expect(buttonByText(c, 'Save')).toBeUndefined();
    expect(buttonByText(c, 'Submit')).toBeUndefined();
    expect(c.querySelectorAll('input')).toHaveLength(0);
    expect(rowEls(c)).toHaveLength(1);
  });

  it('shows a load failure with PortalMessage', async () => {
    getRequest.mockResolvedValue({ ok: false, error: { kind: 'not_found', message: 'Not found.' } });
    const c = await mount(5);
    expect(c.querySelector('.portal-message')).not.toBeNull();
    expect(buttonByText(c, 'Save')).toBeUndefined();
  });
});
