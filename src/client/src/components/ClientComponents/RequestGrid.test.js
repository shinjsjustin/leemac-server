import React, { act } from 'react';
import { render } from '../../testUtils/render';
import RequestGrid, { emptyRow, emptyRows, isRowEmpty } from './RequestGrid';
import { downloadFile } from '../../api/portalApi';

jest.mock('../../api/portalApi', () => ({ downloadFile: jest.fn() }));
jest.mock('./drawingQueue', () => ({ enqueue: jest.fn(), enqueueRequestFile: jest.fn() }));
jest.mock('./DrawingTile', () => ({
  __esModule: true,
  default: ({ file, width, aspect, enqueue }) => (
    <div
      data-testid="tile"
      data-name={file.filename}
      data-width={width}
      data-aspect={aspect}
      data-request-id={file.request_id}
      data-file-id={file.id}
      data-custom-enqueue={enqueue ? 'yes' : 'no'}
      data-is-request-queue={enqueue === jest.requireMock('./drawingQueue').enqueueRequestFile ? 'yes' : 'no'}
    />
  ),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const NO_PDF = 'Add one PDF file';
const NO_STEP = 'Add one STEP file';
const DROP_HINT = 'Drop a PDF and STEP here';
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
beforeEach(() => downloadFile.mockReset());

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
    const labels = [...rows[0].querySelectorAll('label:not(.portal-req-drophere)')].map((l) => l.textContent.replace(' *', ''));
    expect(labels).toEqual(['Part name', 'Description', 'Rev', 'Material', 'Finish', 'Quantity']);
    expect(rows[0].children).toHaveLength(7);
    expect([...rows[0].children].map((el) => el.className.split(' ')[0])).toEqual([
      'portal-req-drawing', 'portal-req-part', 'portal-req-rev', 'portal-req-material', 'portal-req-finish', 'portal-req-qty', 'portal-request-cell-files',
    ]);
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
    inputs.forEach((i) => expect(i.labels[0].classList.contains('portal-visually-hidden')).toBe(true));
    expect(c.querySelector('label[for$="-part_number"]').textContent).toBe('Part name');
    expect(inputs[5].labels[0].textContent).toBe('Quantity *');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[2], 'B');
      inputs[2].dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onChange.mock.calls[0][0][0].rev).toBe('B');
  });

  it('adds one empty row with the + Add line button', () => {
    const rows = emptyRows(2);
    const onChange = jest.fn();
    const c = mount({ rows, onChange });
    const add = buttonByText(c, '+ Add line');
    expect(add.getAttribute('aria-label')).toBe('Add row');
    expect(add.classList.contains('portal-button')).toBe(false);
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

  it('labels the header columns in row order', () => {
    const c = mount({ rows: emptyRows(1) });
    const head = c.querySelector('.portal-request-head');
    expect([...head.children].map((el) => el.textContent)).toEqual(['Drawing', 'Part', 'Rev', 'Material', 'Finish', 'Qty', 'Files']);
  });

  it('warns per missing file kind on non-empty rows, never on empty rows', () => {
    const rows = [
      row(),
      row({ part_number: 'A' }),
      row({ files: [saved(1, 'a.PDF'), saved(2, 'a.stp')] }),
      row({ files: [saved(1, 'a.pdf'), saved(2, 'b.pdf'), saved(3, 'a.step')] }),
      row({ files: [saved(1, 'a.pdf')], pending: [new File(['x'], 'a.step')] }),
      row({ files: [saved(1, 'a.step')] }),
    ];
    const c = mount({ rows });
    const warned = [...c.querySelectorAll('.portal-request-row')].map((r) => {
      const t = r.querySelector('.portal-request-cell-files').textContent;
      return [t.includes(NO_PDF), t.includes(NO_STEP)];
    });
    expect(warned).toEqual([[false, false], [true, true], [false, false], [true, false], [false, false], [true, false]]);
    expect(c.querySelectorAll('.portal-req-warning')).toHaveLength(4);
  });

  it('flags Qty with the warn class only on non-empty rows with no quantity', () => {
    const rows = [row(), row({ part_number: 'A' }), row({ part_number: 'A', quantity: 3 })];
    const c = mount({ rows });
    const warned = [...c.querySelectorAll('.portal-request-row')].map((r) => r.querySelector('input[type=number]').classList.contains('portal-req-field--warn'));
    expect(warned).toEqual([false, true, false]);
  });

  it('never shows the old files-cell drop label and makes the empty drawing slot the drop label', () => {
    const rows = [row({ part_number: 'A' }), row({ files: [saved(1, 'a.step')] }), row()];
    const c = mount({ rows });
    expect(c.textContent).not.toContain('Click or drag files here');
    expect(c.querySelector('.portal-request-drop')).toBeNull();
    const slot = c.querySelector('.portal-req-drawing .portal-req-drophere');
    expect(slot.tagName).toBe('LABEL');
    const input = slot.querySelector('input[type=file]');
    expect(input.hidden).toBe(true);
    expect(input.multiple).toBe(true);
    expect(c.querySelectorAll('input[type=file]')).toHaveLength(3);
  });

  it('keeps the drawing slot plain when readOnly', () => {
    const c = mount({ rows: [row({ part_number: 'A' })], readOnly: true });
    expect(c.querySelector('.portal-req-drophere').tagName).toBe('DIV');
    expect(c.querySelector('input')).toBeNull();
  });

  it('marks file items ok with one PDF and one STEP, warn otherwise, and neither when readOnly', () => {
    const both = [saved(1, 'a.pdf'), saved(2, 'a.step')];
    const rows = [
      row({ files: both }),
      row({ files: [saved(3, 'b.pdf')], pending: [new File(['x'], 'b.stp')] }),
      row({ files: [saved(4, 'c.pdf')] }),
      row({ files: [saved(5, 'd.pdf'), saved(6, 'e.pdf'), saved(7, 'd.step')] }),
    ];
    const classes = (props) => [...mount(props).querySelectorAll('.portal-request-row')]
      .map((r) => [...r.querySelectorAll('.portal-request-cell-files li')].map((li) => li.className));
    expect(classes({ rows })).toEqual([
      ['portal-req-file--ok', 'portal-req-file--ok'],
      ['portal-req-file--ok', 'portal-req-file--ok'],
      ['portal-req-file--warn'],
      ['portal-req-file--warn', 'portal-req-file--warn', 'portal-req-file--warn'],
    ]);
    view.unmount();
    expect(classes({ rows: [rows[0]], readOnly: true })).toEqual([['', '']]);
  });

  it('shows no warnings when readOnly', () => {
    const c = mount({ rows: [row({ part_number: 'A' })], readOnly: true });
    expect(c.textContent).not.toContain(NO_PDF);
    expect(c.textContent).not.toContain(NO_STEP);
  });

  describe('drawing box', () => {
    it('renders a DrawingTile of the first PDF part_file', () => {
      const parts = [{ id: 8, filename: 'a.step' }, { id: 7, filename: 'b.PDF' }, { id: 9, filename: 'c.pdf' }];
      const c = mount({ rows: [row({ part_files: parts })] });
      const tile = c.querySelector('.portal-req-drawing [data-testid=tile]');
      expect(tile.dataset.name).toBe('b.PDF');
      expect(tile.dataset.width).toBe('172');
      expect(Number(tile.dataset.aspect)).toBeCloseTo(400 / 260);
      expect(c.querySelector('.portal-req-drophere')).toBeNull();
    });

    it('shows a dashed box naming the line PDF when no part PDF exists', () => {
      const c = mount({ rows: [row({ part_number: 'A', files: [saved(1, 'a.step'), saved(2, 'plan.pdf')] })] });
      const box = c.querySelector('.portal-req-drawing .portal-req-drophere');
      expect(box.textContent).toBe('plan.pdf');
      expect(box.style.aspectRatio).toBeTruthy();
      expect(c.querySelector('[data-testid=tile]')).toBeNull();
    });

    it('previews a saved line PDF through the request-file queue with the request id', () => {
      const c = mount({ requestId: 5, rows: [row({ files: [saved(1, 'a.step'), saved(2, 'plan.pdf')] })] });
      const tile = c.querySelector('.portal-req-drawing [data-testid=tile]');
      expect(tile.dataset.name).toBe('plan.pdf');
      expect(tile.dataset.fileId).toBe('2');
      expect(tile.dataset.requestId).toBe('5');
      expect(tile.dataset.isRequestQueue).toBe('yes');
    });

    it('keeps part PDFs on the default queue', () => {
      const c = mount({ requestId: 5, rows: [row({ files: [saved(2, 'plan.pdf')], part_files: [{ id: 7, filename: 'b.pdf' }] })] });
      const tile = c.querySelector('.portal-req-drawing [data-testid=tile]');
      expect(tile.dataset.name).toBe('b.pdf');
      expect(tile.dataset.customEnqueue).toBe('no');
    });

    it('shows a skeleton tile while the line has pending uploads', () => {
      const c = mount({ requestId: 5, rows: [row({ pending: [new File(['x'], 'plan.pdf')] })] });
      expect(c.querySelector('.portal-req-drawing .portal-tile--skeleton')).not.toBeNull();
      expect(c.querySelector('.portal-req-drophere')).toBeNull();
    });

    it('asks for a PDF and STEP when the line has no PDF', () => {
      const c = mount({ rows: [row({ files: [saved(1, 'a.step')] })] });
      expect(c.querySelector('.portal-req-drophere').textContent).toBe(DROP_HINT);
    });
  });

  describe('source part', () => {
    it('says From your part <part_number> when source_part_id is set', () => {
      const c = mount({ rows: [row({ part_number: 'BR-1', source_part_id: 5 }), row({ part_number: 'BR-2' })] });
      const [r0, r1] = c.querySelectorAll('.portal-request-row');
      expect(r0.textContent).toContain('From your part BR-1');
      expect(r1.textContent).not.toContain('From your part');
    });

    it('defaults source_part_id to null and ignores it in isRowEmpty', () => {
      expect(emptyRow().source_part_id).toBeNull();
      expect(isRowEmpty(row({ source_part_id: 5 }))).toBe(true);
    });
  });

  it('adds picked files to pending through onChange', () => {
    const rows = [row()];
    const onChange = jest.fn();
    const c = mount({ rows, onChange });
    const input = c.querySelector('input[type=file]');
    const picked = [new File(['y'], 'new.step')];
    Object.defineProperty(input, 'files', { value: picked, configurable: true });
    act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    const next = onChange.mock.calls[0][0];
    expect(next[0].pending.map((f) => f.name)).toEqual(['new.step']);
  });

  it('adds dropped files to pending and allows the drop', () => {
    const rows = [row()];
    const onChange = jest.fn();
    const c = mount({ rows, onChange });
    const zone = c.querySelector('.portal-req-drophere');
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    act(() => { zone.dispatchEvent(over); });
    expect(over.defaultPrevented).toBe(true);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    drop.dataTransfer = { files: [new File(['y'], 'dropped.step')] };
    act(() => { zone.dispatchEvent(drop); });
    expect(drop.defaultPrevented).toBe(true);
    expect(onChange.mock.calls[0][0][0].pending.map((f) => f.name)).toEqual(['dropped.step']);
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

  it('omits read-only cells whose value is blank', () => {
    const c = mount({ rows: [row({ part_number: 'PN-9', quantity: '' })], readOnly: true });
    const labels = [...c.querySelectorAll('.portal-request-label')].map((l) => l.textContent);
    expect(labels).toContain('Part name');
    for (const blank of ['Rev', 'Material', 'Finish', 'Quantity']) expect(labels).not.toContain(blank);
  });

  describe('read-only columns', () => {
    const rows = () => [
      row({ part_number: 'A-1', material: 'Steel', quantity: 5 }),
      row({ part_number: 'B-2', quantity: 12 }),
    ];

    it('drops columns no row uses and keeps header and row cells in the same order', () => {
      const c = mount({ rows: rows(), readOnly: true });
      const head = [...c.querySelector('.portal-request-head').children].map((el) => el.textContent);
      expect(head).toEqual(['Drawing', 'Part', 'Material', 'Qty', 'Files']);
      const qtyAt = head.indexOf('Qty');
      const bodies = [...c.querySelectorAll('.portal-request-row')];
      bodies.forEach((r) => expect(r.children).toHaveLength(head.length));
      expect(bodies.map((r) => r.children[qtyAt].textContent)).toEqual(['Quantity5', 'Quantity12']);
    });

    it('renders an empty cell where a shown column is blank so later cells keep position', () => {
      const c = mount({ rows: rows(), readOnly: true });
      const second = c.querySelectorAll('.portal-request-row')[1];
      expect(second.children[2].textContent).toBe('');
      expect(second.children[2].className).toContain('portal-req-material');
    });

    it('sets one grid template on header and rows from the shown columns', () => {
      const c = mount({ rows: rows(), readOnly: true });
      const head = c.querySelector('.portal-request-head');
      const body = c.querySelector('.portal-request-row');
      expect(head.style.getPropertyValue('--portal-req-cols')).not.toBe('');
      expect(body.style.getPropertyValue('--portal-req-cols')).toBe(head.style.getPropertyValue('--portal-req-cols'));
    });

    it('shows a column when only a later row has a value in it', () => {
      const c = mount({ rows: [row({ part_number: 'A' }), row({ part_number: 'B', rev: 'C' })], readOnly: true });
      const head = [...c.querySelector('.portal-request-head').children].map((el) => el.textContent);
      expect(head).toEqual(['Drawing', 'Part', 'Rev', 'Files']);
    });
  });

  describe('part_files', () => {
    const drawing = { id: 7, filename: 'bracket.pdf' };
    const step = { id: 8, filename: 'bracket.step' };

    it('defaults to an empty list and does not make a row non-empty', () => {
      expect(emptyRow().part_files).toEqual([]);
      expect(isRowEmpty(row({ part_files: [drawing] }))).toBe(true);
    });

    it('renders no On file label for rows without part_files', () => {
      const c = mount({ rows: [row({ part_number: 'A' })] });
      expect(c.textContent).not.toContain('On file');
    });

    it.each([false, true])('lists part_files as quiet buttons that download the file (readOnly %s)', (readOnly) => {
      const c = mount({ rows: [row({ part_number: 'A', part_files: [drawing, step] })], readOnly });
      const cell = c.querySelector('.portal-request-cell-files');
      expect(cell.textContent).toContain('On file');
      const buttons = [...cell.querySelectorAll('button.portal-button.portal-button--quiet')];
      expect(buttons.map((b) => b.textContent)).toEqual(['bracket.pdf', 'bracket.step']);
      click(buttons[1]);
      expect(downloadFile).toHaveBeenCalledTimes(1);
      expect(downloadFile).toHaveBeenCalledWith(step);
    });

    it('never offers Remove for part_files and does not trigger the PDF/STEP warning', () => {
      const c = mount({ rows: [row({ part_number: 'A', part_files: [drawing] })] });
      expect([...c.querySelectorAll('button')].filter((b) => b.textContent.startsWith('Remove'))).toHaveLength(0);
      expect(c.textContent).toContain(NO_PDF);
      const both = mount({ rows: [row({ files: [saved(1, 'a.pdf'), saved(2, 'a.step')], part_files: [drawing, step] })] });
      expect(both.textContent).not.toContain(NO_PDF);
      expect(both.textContent).not.toContain(NO_STEP);
    });
  });
});

describe('part match line', () => {
  const matchFor = (over = {}) => ({ part_number: 'HSX2-0871', rev: 'F', job_number: '13655', quantity: 120, ...over });
  const matchText = (c) => c.querySelector('.portal-req-match')?.textContent;

  it('shows the sentence for the matches entry keyed by row key', () => {
    const r = row({ part_number: 'hsx2-0871' });
    const c = mount({ rows: [r, row()], matches: { [r.key]: matchFor() } });
    expect(c.querySelectorAll('.portal-req-match')).toHaveLength(1);
    expect(matchText(c)).toBe('Matches your part HSX2-0871 Rev F, last made on job 13655 (120 pcs)');
  });

  it.each([
    [{ rev: '' }, 'Matches your part HSX2-0871, last made on job 13655 (120 pcs)'],
    [{ job_number: null, quantity: null }, 'Matches your part HSX2-0871 Rev F'],
    [{ job_number: '', quantity: 5 }, 'Matches your part HSX2-0871 Rev F'],
    [{ quantity: '' }, 'Matches your part HSX2-0871 Rev F, last made on job 13655'],
  ])('leaves out blank pieces %j', (over, expected) => {
    const r = row({ part_number: 'x' });
    expect(matchText(mount({ rows: [r], matches: { [r.key]: matchFor(over) } }))).toBe(expected);
  });

  it('shows no match line without a matches entry', () => {
    expect(matchText(mount({ rows: [row({ part_number: 'x' })], matches: {} }))).toBeUndefined();
  });

  it('calls onPartBlur with the row when the part number loses focus', () => {
    const onPartBlur = jest.fn();
    const r = row({ part_number: 'A1' });
    const c = mount({ rows: [r], onPartBlur });
    act(() => {
      const input = c.querySelector(`#${r.key}-part_number`);
      input.focus();
      input.blur();
    });
    expect(onPartBlur).toHaveBeenCalledTimes(1);
    expect(onPartBlur).toHaveBeenCalledWith(r);
  });
});
