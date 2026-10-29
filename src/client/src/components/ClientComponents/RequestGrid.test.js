import React, { act } from 'react';
import { render } from '../../testUtils/render';
import RequestGrid, { emptyRow, emptyRows, isRowEmpty } from './RequestGrid';

global.IS_REACT_ACT_ENVIRONMENT = true;

const WARNING = 'Add one PDF drawing and one STEP file';
const saved = (id, filename) => ({ id, filename, mimetype: 'x', size: 1 });
const row = (over = {}) => ({ ...emptyRow(), ...over });
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const buttonByText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

let view;
const mount = (props) => {
  view = render(<RequestGrid onChange={() => {}} {...props} />);
  return view.container;
};
afterEach(() => view && view.unmount());

describe('helpers', () => {
  it('emptyRows(n) builds n empty rows with distinct keys', () => {
    const rows = emptyRows(3);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.key)).size).toBe(3);
    expect(rows.every(isRowEmpty)).toBe(true);
  });

  it.each([
    [{ part_number: 'A' }, false],
    [{ description: ' x ' }, false],
    [{ quantity: 2 }, false],
    [{ files: [saved(1, 'a.pdf')] }, false],
    [{ pending: [new File(['x'], 'a.pdf')] }, false],
    [{ part_number: '   ', quantity: '' }, true],
  ])('isRowEmpty(%j) is %s', (over, expected) => {
    expect(isRowEmpty(row(over))).toBe(expected);
  });
});

describe('RequestGrid', () => {
  it('renders 10 rows with labelled inputs and no price field', () => {
    const c = mount({ rows: emptyRows(10) });
    const rows = c.querySelectorAll('.portal-request-row');
    expect(rows).toHaveLength(10);
    const labels = [...rows[0].querySelectorAll('label')].map((l) => l.textContent.replace(' *', ''));
    expect(labels).toEqual(['Click or drag files here', 'Part name', 'Description', 'Rev', 'Material', 'Finish', 'Quantity']);
    expect(rows[0].children).toHaveLength(4);
    expect(c.textContent).not.toContain('Part number');
    expect(rows[0].querySelectorAll('input')).toHaveLength(7);
    [...rows[0].querySelectorAll('input')].forEach((i) => expect(i.labels.length).toBe(1));
    const qty = rows[0].querySelector('input[type=number]');
    expect(qty.min).toBe('1');
    expect(qty.required).toBe(true);
    const file = rows[0].querySelector('input[type=file]');
    expect(file.multiple).toBe(true);
    expect(file.accept).toContain('.pdf');
    expect(file.accept).toContain('.stp');
    expect(c.textContent.toLowerCase()).not.toContain('price');
  });

  it('gives editable inputs placeholders while keeping one label each and typing working', () => {
    const onChange = jest.fn();
    const c = mount({ rows: emptyRows(1), onChange });
    const inputs = [...c.querySelector('.portal-request-row').querySelectorAll('input:not([type=file])')];
    expect(inputs.map((i) => i.placeholder)).toEqual(['Part name', 'Description', 'Rev', 'Material', 'Finish', 'Qty']);
    inputs.forEach((i) => expect(i.labels).toHaveLength(1));
    expect(inputs[5].labels[0].textContent).toBe('Quantity *');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[2], 'B');
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange.mock.calls[0][0][0].rev).toBe('B');
  });

  it('adds one empty row with the + button', () => {
    const rows = emptyRows(2);
    const onChange = jest.fn();
    const c = mount({ rows, onChange });
    const add = buttonByText(c, '+');
    expect(add.getAttribute('aria-label')).toBe('Add row');
    click(add);
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(3);
    expect(next.slice(0, 2)).toEqual(rows);
    expect(isRowEmpty(next[2])).toBe(true);
  });

  it('calls onChange with the edited field', () => {
    const rows = emptyRows(2);
    const onChange = jest.fn();
    const c = mount({ rows, onChange });
    const input = c.querySelectorAll('.portal-request-row')[1].querySelector('input[type=text]');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'P-1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const next = onChange.mock.calls[0][0];
    expect(next[1].part_number).toBe('P-1');
    expect(next[0]).toBe(rows[0]);
  });

  it('warns on non-empty rows without one PDF and one STEP file, never on empty rows', () => {
    const rows = [
      row(),
      row({ part_number: 'A' }),
      row({ files: [saved(1, 'a.PDF'), saved(2, 'a.stp')] }),
      row({ files: [saved(1, 'a.pdf'), saved(2, 'b.pdf'), saved(3, 'a.step')] }),
      row({ files: [saved(1, 'a.pdf')], pending: [new File(['x'], 'a.step')] }),
    ];
    const c = mount({ rows });
    const warned = [...c.querySelectorAll('.portal-request-row')].map((r) => r.textContent.includes(WARNING));
    expect(warned).toEqual([false, true, false, true, false]);
  });

  it('adds picked files to pending through onChange', () => {
    const rows = [row({ pending: [new File(['x'], 'old.pdf')] })];
    const onChange = jest.fn();
    const c = mount({ rows, onChange });
    const input = c.querySelector('input[type=file]');
    const picked = [new File(['y'], 'new.step')];
    Object.defineProperty(input, 'files', { value: picked, configurable: true });
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    const next = onChange.mock.calls[0][0];
    expect(next[0].pending.map((f) => f.name)).toEqual(['old.pdf', 'new.step']);
  });

  it('adds dropped files to pending and allows the drop', () => {
    const rows = [row({ pending: [new File(['x'], 'old.pdf')] })];
    const onChange = jest.fn();
    const c = mount({ rows, onChange });
    const zone = c.querySelector('.portal-request-drop');
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    act(() => { zone.dispatchEvent(over); });
    expect(over.defaultPrevented).toBe(true);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    drop.dataTransfer = { files: [new File(['y'], 'dropped.step')] };
    act(() => { zone.dispatchEvent(drop); });
    expect(drop.defaultPrevented).toBe(true);
    expect(onChange.mock.calls[0][0][0].pending.map((f) => f.name)).toEqual(['old.pdf', 'dropped.step']);
  });

  it('removes a saved or pending file through onChange', () => {
    const keep = new File(['x'], 'keep.step');
    const rows = [row({ files: [saved(1, 'a.pdf'), saved(2, 'b.pdf')], pending: [keep, new File(['x'], 'gone.png')] })];
    const onChange = jest.fn();
    const c = mount({ rows, onChange });
    const removes = [...c.querySelectorAll('button')].filter((b) => b.textContent.startsWith('Remove'));
    expect(removes).toHaveLength(4);
    click(removes[0]);
    expect(onChange.mock.calls[0][0][0].files.map((f) => f.id)).toEqual([2]);
    click(removes[3]);
    const after = onChange.mock.calls[1][0][0];
    expect(after.pending).toEqual([keep]);
    expect(after.files).toHaveLength(2);
  });

  it('shows row errors by key', () => {
    const rows = emptyRows(2);
    const c = mount({ rows, errors: { [rows[1].key]: 'Quantity is required' } });
    const [r0, r1] = c.querySelectorAll('.portal-request-row');
    expect(r0.textContent).not.toContain('Quantity is required');
    expect(r1.textContent).toContain('Quantity is required');
  });

  it('renders text without inputs or buttons when readOnly', () => {
    const rows = [row({ part_number: 'PN-9', description: 'Bracket', quantity: 4, files: [saved(1, 'a.pdf')] })];
    const c = mount({ rows, readOnly: true });
    expect(c.querySelectorAll('input, button')).toHaveLength(0);
    expect(c.textContent).toContain('PN-9');
    expect(c.textContent).toContain('Bracket');
    expect(c.textContent).toContain('a.pdf');
    expect(c.textContent).toContain('4');
  });
});
