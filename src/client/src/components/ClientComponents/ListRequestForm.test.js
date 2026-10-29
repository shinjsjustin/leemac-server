import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ListRequestForm from './ListRequestForm';
import { getRequestLines, requestFromList } from '../../api/portalListsApi';

jest.mock('../../api/portalListsApi', () => ({ getRequestLines: jest.fn(), requestFromList: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const LIST = { id: 7, name: 'Spring order' };
const line = (id, over = {}) => ({
  part_id: id, part_number: `PN-${id}`, description: `Bracket ${id}`,
  rev: 'A', material: 'Steel', finish: 'Anodize',
  drawings: [{ id: 30 + id, filename: `d${id}.pdf`, mimetype: 'application/pdf' }], ...over,
});
const ok = (data) => ({ ok: true, data });
const fail = (kind, message) => ({ ok: false, error: { kind, message } });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const buttonByText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);
const field = (row, label) => [...row.querySelectorAll('label')].find((l) => l.textContent.startsWith(label)).querySelector('input');

let view;
const props = { onCancel: jest.fn(), onSubmitted: jest.fn(), onGone: jest.fn() };
const mount = async () => {
  view = render(<ListRequestForm list={LIST} {...props} />);
  await flush();
  return view.container;
};
const submit = async (c) => { click(buttonByText(c, 'Submit')); await flush(); };

beforeEach(() => {
  Object.values(props).forEach((f) => f.mockReset());
  getRequestLines.mockReset().mockResolvedValue(ok([line(1), line(2, { rev: null, drawings: [] })]));
  requestFromList.mockReset().mockResolvedValue(ok({ id: 99 }));
});
afterEach(() => view && view.unmount());

describe('ListRequestForm', () => {
  it('loads lines for the list and renders prefilled rows with the part number as text', async () => {
    const c = await mount();
    expect(getRequestLines).toHaveBeenCalledWith(7);
    const rows = c.querySelectorAll('div.portal-list-request-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('strong').textContent).toBe('PN-1');
    expect(rows[0].textContent).toContain('Drawings on file');
    expect(rows[0].textContent).toContain('d1.pdf');
    expect(rows[0].querySelectorAll('input')).toHaveLength(5);
    expect(field(rows[0], 'Description').value).toBe('Bracket 1');
    expect(field(rows[0], 'Rev').value).toBe('A');
    expect(field(rows[0], 'Material').value).toBe('Steel');
    expect(field(rows[0], 'Finish').value).toBe('Anodize');
    expect(field(rows[0], 'Quantity').value).toBe('');
    expect(field(rows[0], 'Quantity').type).toBe('number');
    expect(field(rows[0], 'Quantity').min).toBe('1');
    expect(field(rows[1], 'Rev').value).toBe('');
    expect(rows[1].textContent).not.toContain('Drawings on file');
  });

  it('shows loading, then a load error with invalid mapped to error', async () => {
    getRequestLines.mockReturnValue(new Promise(() => {}));
    view = render(<ListRequestForm list={LIST} {...props} />);
    expect(view.container.querySelector('.portal-message').textContent).toContain('Loading');
    view.unmount();
    getRequestLines.mockResolvedValue(fail('invalid', 'Bad list'));
    const c = await mount();
    expect(c.querySelector('.portal-message[role="alert"]').textContent).toContain('Bad list');
  });

  it('calls onGone once and shows no error when the lines load as not_found', async () => {
    getRequestLines.mockResolvedValue(fail('not_found', 'List gone'));
    const c = await mount();
    expect(props.onGone).toHaveBeenCalledTimes(1);
    expect(c.textContent).not.toContain('List gone');
    expect(c.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows other load errors without calling onGone', async () => {
    getRequestLines.mockResolvedValue(fail('error', 'Server down'));
    const c = await mount();
    expect(c.querySelector('.portal-message[role="alert"]').textContent).toContain('Server down');
    expect(props.onGone).not.toHaveBeenCalled();
  });

  it('does not call onGone when not_found arrives after unmount', async () => {
    let resolve;
    getRequestLines.mockReturnValue(new Promise((r) => { resolve = r; }));
    view = render(<ListRequestForm list={LIST} {...props} />);
    view.unmount();
    resolve(fail('not_found', 'List gone'));
    await flush();
    expect(props.onGone).not.toHaveBeenCalled();
  });

  it('submits only rows with a quantity, with edited values, then calls onSubmitted', async () => {
    const c = await mount();
    const rows = c.querySelectorAll('.portal-list-request-row');
    type(field(rows[1], 'Quantity'), '5');
    type(field(rows[1], 'Description'), 'Changed');
    await submit(c);
    expect(requestFromList).toHaveBeenCalledTimes(1);
    expect(requestFromList).toHaveBeenCalledWith(7, {
      name: 'Spring order',
      lines: [{ part_id: 2, quantity: 5, description: 'Changed', rev: '', material: 'Steel', finish: 'Anodize' }],
    });
    expect(props.onSubmitted).toHaveBeenCalledWith({ id: 99 });
  });

  it('asks for a quantity and sends nothing when none is filled', async () => {
    const c = await mount();
    await submit(c);
    expect(requestFromList).not.toHaveBeenCalled();
    expect(c.textContent).toContain('Add a quantity to at least one part.');
  });

  it('shows the message for a 400 or 409 and calls onGone for a 404', async () => {
    const c = await mount();
    type(field(c.querySelector('.portal-list-request-row'), 'Quantity'), '2');
    requestFromList.mockResolvedValue(fail('invalid', 'This list changed. Reload it and try again.'));
    await submit(c);
    expect(c.textContent).toContain('This list changed. Reload it and try again.');
    expect(props.onGone).not.toHaveBeenCalled();
    requestFromList.mockResolvedValue(fail('not_found', 'gone'));
    await submit(c);
    expect(props.onGone).toHaveBeenCalledTimes(1);
    expect(props.onSubmitted).not.toHaveBeenCalled();
  });

  it('disables Submit while the request is in flight', async () => {
    const c = await mount();
    type(field(c.querySelector('.portal-list-request-row'), 'Quantity'), '2');
    requestFromList.mockReturnValue(new Promise(() => {}));
    click(buttonByText(c, 'Submit'));
    await flush();
    expect(buttonByText(c, 'Submit').disabled).toBe(true);
  });

  it('cancels from the Cancel button and the Escape key, and stops listening after unmount', async () => {
    const c = await mount();
    expect(c.textContent).toContain('escape to cancel');
    click(buttonByText(c, 'Cancel'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(props.onCancel).toHaveBeenCalledTimes(2);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })); });
    expect(props.onCancel).toHaveBeenCalledTimes(2);
    view.unmount();
    view = null;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(props.onCancel).toHaveBeenCalledTimes(2);
  });
});
