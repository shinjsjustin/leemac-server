import React, { act } from 'react';
import { render } from '../../testUtils/render';
import OverviewRail from './OverviewRail';

global.IS_REACT_ACT_ENVIRONMENT = true;

const PARTS = [
  { part_id: 1, part_number: 'A-100', part_description: 'Bracket', jobs: [{ id: 7, job_number: 'J-7' }, { id: 8, job_number: 'J-8' }], drawings: [] },
  { part_id: 2, part_number: 'B-200', part_description: 'Plate', jobs: [{ id: 9, job_number: 'J-9' }], drawings: [] },
  { part_id: 3, part_number: 'C-300', part_description: 'Loose gear', jobs: [], drawings: [] },
];
const LISTS = [{ id: 1, name: 'Brackets', part_ids: [1] }];

const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const tab = (c, name) => [...c.querySelectorAll('[role="tab"]')].find((t) => t.textContent.startsWith(name));

let view;
let props;
const mount = (over = {}) => {
  props = {
    parts: PARTS,
    lists: LISTS,
    openNumbers: {},
    focusedKey: null,
    onOpenPart: jest.fn(),
    onCreate: jest.fn().mockResolvedValue(true),
    onRename: jest.fn().mockResolvedValue(true),
    onDelete: jest.fn().mockResolvedValue(true),
    isBusy: false,
    ...over,
  };
  view = render(<OverviewRail {...props} />);
  return view.container;
};
afterEach(() => view.unmount());

describe('OverviewRail', () => {
  it('shows Parts and Lists tabs with counts, Parts selected first', () => {
    const c = mount();
    const tabs = [...c.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Parts 3', 'Lists 1']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
  });

  it('shows part number, description and job numbers on each part row', () => {
    const c = mount();
    const rows = c.querySelectorAll('button.portal-overview-part');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('A-100');
    expect(rows[0].textContent).toContain('Bracket');
    expect(rows[0].textContent).toContain('J-7');
    expect(rows[0].textContent).toContain('J-8');
    expect(rows[1].textContent).not.toContain('J-7');
  });

  it('narrows rows by part number or description, ignoring case', () => {
    const c = mount();
    const filter = c.querySelector('input[aria-label="Filter parts"]');
    type(filter, 'b-2');
    expect([...c.querySelectorAll('.portal-overview-part')].map((r) => r.textContent)).toEqual([expect.stringContaining('B-200')]);
    type(filter, 'GEAR');
    expect([...c.querySelectorAll('.portal-overview-part')].map((r) => r.textContent)).toEqual([expect.stringContaining('C-300')]);
  });

  it('calls onOpenPart with the part when a row is clicked', () => {
    const c = mount();
    click(c.querySelectorAll('.portal-overview-part')[1]);
    expect(props.onOpenPart).toHaveBeenCalledWith(PARTS[1]);
  });

  it('renders the lists panel on the Lists tab and hides the part rows', () => {
    const c = mount();
    click(tab(c, 'Lists'));
    expect(tab(c, 'Lists').getAttribute('aria-selected')).toBe('true');
    expect(c.querySelector('.portal-rail')).not.toBeNull();
    expect(c.querySelector('input[aria-label="Filter parts"]')).toBeNull();
    expect(c.querySelector('.portal-rail-name').textContent).toBe('Brackets');
  });

  it('passes list create to the panel without a Request button', async () => {
    const c = mount();
    click(tab(c, 'Lists'));
    type(c.querySelector('input[aria-label="New list name"]'), 'Gears');
    await act(async () => { [...c.querySelectorAll('button')].find((b) => b.textContent === 'New list').click(); });
    expect(props.onCreate).toHaveBeenCalledWith('Gears');
    expect([...c.querySelectorAll('button')].some((b) => b.textContent === 'Request')).toBe(false);
  });
});
