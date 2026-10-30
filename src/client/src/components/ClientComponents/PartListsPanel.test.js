import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartListsPanel from './PartListsPanel';

global.IS_REACT_ACT_ENVIRONMENT = true;

const LISTS = [
  { id: 1, name: 'Brackets', part_ids: [1, 99, 2] },
  { id: 2, name: 'Gears', part_ids: [] },
];
const PARTS = [
  { part_id: 1, part_number: 'A-100', part_description: 'Bracket', latest: { job_number: 'J-11' } },
  { part_id: 2, part_number: 'B-200', part_description: 'Plate', latest: { job_number: 'J-22' } },
  { part_id: 3, part_number: 'C-300', part_description: 'Loose gear', latest: null },
];
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const buttonByText = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);

let view;
let props;
const mount = (over = {}) => {
  props = {
    lists: LISTS,
    parts: PARTS,
    onOpenPart: jest.fn(),
    onCreate: jest.fn().mockResolvedValue(true),
    onRename: jest.fn().mockResolvedValue(true),
    onDelete: jest.fn().mockResolvedValue(true),
    isBusy: false,
    ...over,
  };
  view = render(<PartListsPanel {...props} />);
  return view.container;
};
const group = (c, i) => c.querySelectorAll('.portal-rail-list')[i];
afterEach(() => view && view.unmount());

describe('PartListsPanel', () => {
  it('reads the list name followed by a dot and the count in the head', () => {
    const c = mount();
    expect(group(c, 0).querySelector('.portal-rail-head').textContent).toBe('Brackets\u00b7 2Edit');
  });

  it('shows each list header with name and count, and rows of number and description', () => {
    const c = mount();
    const first = group(c, 0);
    expect(first.querySelector('.portal-rail-head').textContent).toContain('Brackets');
    expect(first.querySelector('.portal-rail-count').textContent).toBe('\u00b7 2');
    const rows = first.querySelectorAll('.portal-rail-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('A-100');
    expect(rows[0].textContent).toContain('Bracket');
    expect(rows[1].textContent).toContain('B-200');
    expect(group(c, 1).querySelector('.portal-rail-count').textContent).toBe('\u00b7 0');
    expect(group(c, 1).querySelectorAll('.portal-rail-row')).toHaveLength(0);
  });

  it('puts parts in no list under Not on a list', () => {
    const c = mount();
    const other = c.querySelector('.portal-rail-unlisted');
    const rows = other.querySelectorAll('.portal-rail-row');
    expect(other.textContent).toContain('Not on a list');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('C-300');
  });

  it('calls onOpenPart with the part when a row is clicked', () => {
    const c = mount();
    click(group(c, 0).querySelectorAll('.portal-rail-row')[1]);
    expect(props.onOpenPart).toHaveBeenCalledWith(PARTS[1]);
  });

  it('hides the new list input until + New list is clicked', () => {
    const c = mount();
    expect(c.querySelector('input[aria-label="New list name"]')).toBeNull();
    click(buttonByText(c, '+ New list'));
    expect(c.querySelector('input[aria-label="New list name"]')).not.toBeNull();
    expect(buttonByText(c, 'Create')).toBeDefined();
  });

  it('creates a list with the trimmed name, disables Create when blank and closes on success', async () => {
    const c = mount();
    click(buttonByText(c, '+ New list'));
    const input = c.querySelector('input[aria-label="New list name"]');
    expect(buttonByText(c, 'Create').disabled).toBe(true);
    type(input, '   ');
    expect(buttonByText(c, 'Create').disabled).toBe(true);
    type(input, '  Valves ');
    click(buttonByText(c, 'Create'));
    await flush();
    expect(props.onCreate).toHaveBeenCalledWith('Valves');
    expect(c.querySelector('input[aria-label="New list name"]')).toBeNull();
  });

  it('keeps the typed name when creating fails', async () => {
    const c = mount({ onCreate: jest.fn().mockResolvedValue(false) });
    click(buttonByText(c, '+ New list'));
    type(c.querySelector('input'), 'Valves');
    click(buttonByText(c, 'Create'));
    await flush();
    expect(c.querySelector('input').value).toBe('Valves');
  });

  it('shows the job number on each row that has one', () => {
    const c = mount();
    const rows = group(c, 0).querySelectorAll('.portal-rail-row');
    expect(rows[0].querySelector('.portal-rail-job').textContent).toBe('J-11');
    expect(rows[1].querySelector('.portal-rail-job').textContent).toBe('J-22');
    expect(c.querySelector('.portal-rail-unlisted .portal-rail-row .portal-rail-job')).toBeNull();
  });

  it('puts Edit and Request in the header row and shows Delete only while editing', () => {
    const c = mount({ onRequest: jest.fn() });
    const head = group(c, 0).querySelector('.portal-rail-head');
    expect(buttonByText(head, 'Edit').classList.contains('portal-link')).toBe(true);
    const request = buttonByText(head, 'Request');
    expect(request.classList.contains('portal-button')).toBe(true);
    expect(request.classList.contains('portal-button--small')).toBe(true);
    expect(request.classList.contains('portal-button--quiet')).toBe(false);
    expect(buttonByText(group(c, 0), 'Delete')).toBeUndefined();
    click(buttonByText(head, 'Edit'));
    expect(buttonByText(group(c, 0), 'Delete')).toBeDefined();
  });

  it('shows no tabs or filter without the tabs prop', () => {
    const c = mount();
    expect(c.querySelector('[role="tablist"]')).toBeNull();
    expect(c.querySelector('input[aria-label="Filter lists and parts"]')).toBeNull();
  });

  describe('with tabs', () => {
    const tabs = (c) => [...c.querySelectorAll('[role="tab"]')];
    const filter = (c) => c.querySelector('input[aria-label="Filter lists and parts"]');

    it('shows Lists and All parts tabs with counts, Lists selected first', () => {
      const c = mount({ tabs: true });
      expect(tabs(c).map((t) => t.textContent)).toEqual(['Lists 2', 'All parts 3']);
      expect(tabs(c).map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
      expect(c.querySelectorAll('.portal-rail-list')).toHaveLength(2);
    });

    it('lists every part as a row on All parts', () => {
      const c = mount({ tabs: true });
      click(tabs(c)[1]);
      expect(tabs(c)[1].getAttribute('aria-selected')).toBe('true');
      expect(c.querySelectorAll('.portal-rail-list')).toHaveLength(0);
      const rows = c.querySelectorAll('.portal-rail-row');
      expect([...rows].map((r) => r.querySelector('.portal-rail-part').textContent)).toEqual(['A-100', 'B-200', 'C-300']);
    });

    it('narrows rows by number, description or job number, ignoring case', () => {
      const c = mount({ tabs: true });
      click(tabs(c)[1]);
      const shown = () => [...c.querySelectorAll('.portal-rail-part')].map((e) => e.textContent);
      type(filter(c), 'b-2');
      expect(shown()).toEqual(['B-200']);
      type(filter(c), 'GEAR');
      expect(shown()).toEqual(['C-300']);
      type(filter(c), 'j-11');
      expect(shown()).toEqual(['A-100']);
    });

    it('narrows list rows on the Lists tab too', () => {
      const c = mount({ tabs: true });
      type(filter(c), 'plate');
      expect([...group(c, 0).querySelectorAll('.portal-rail-part')].map((e) => e.textContent)).toEqual(['B-200']);
    });
  });

  it('shows Request only when onRequest is given and passes the list id', () => {
    let c = mount();
    expect(buttonByText(group(c, 0), 'Request')).toBeUndefined();
    view.unmount();
    const onRequest = jest.fn();
    c = mount({ onRequest });
    click(buttonByText(group(c, 1), 'Request'));
    expect(onRequest).toHaveBeenCalledWith(2);
  });

  it('asks before deleting and only deletes on Delete list', async () => {
    const c = mount();
    const card = () => group(c, 0);
    click(buttonByText(card(), 'Edit'));
    click(buttonByText(card(), 'Delete'));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(card().textContent).toContain('Delete this list? The parts stay in your portal.');
    click(buttonByText(card(), 'Keep'));
    expect(buttonByText(card(), 'Delete list')).toBeUndefined();
    click(buttonByText(card(), 'Delete'));
    click(buttonByText(card(), 'Delete list'));
    await flush();
    expect(props.onDelete).toHaveBeenCalledWith(1);
    expect(buttonByText(card(), 'Delete list')).toBeUndefined();
  });

  it('stays in confirm mode when delete fails', async () => {
    const c = mount({ onDelete: jest.fn().mockResolvedValue(false) });
    const card = () => group(c, 0);
    click(buttonByText(card(), 'Edit'));
    click(buttonByText(card(), 'Delete'));
    click(buttonByText(card(), 'Delete list'));
    await flush();
    expect(buttonByText(card(), 'Delete list')).toBeDefined();
  });

  it('edits the name in an input and Save renames, leaving edit mode on success', async () => {
    const c = mount();
    const card = () => group(c, 0);
    click(buttonByText(card(), 'Edit'));
    const input = card().querySelector('input');
    expect(input.value).toBe('Brackets');
    type(input, ' Plates ');
    click(buttonByText(card(), 'Save'));
    await flush();
    expect(props.onRename).toHaveBeenCalledWith(1, 'Plates');
    expect(card().querySelector('input')).toBeNull();
    expect(buttonByText(card(), 'Edit')).toBeDefined();
  });

  it('stays in edit mode when rename fails', async () => {
    const c = mount({ onRename: jest.fn().mockResolvedValue(false) });
    const card = () => group(c, 0);
    click(buttonByText(card(), 'Edit'));
    click(buttonByText(card(), 'Save'));
    await flush();
    expect(card().querySelector('input')).not.toBeNull();
  });

  it('disables the actions while busy', () => {
    const c = mount({ isBusy: true });
    expect(buttonByText(c, 'Edit').disabled).toBe(true);
    expect(buttonByText(c, '+ New list').disabled).toBe(true);
  });
});
