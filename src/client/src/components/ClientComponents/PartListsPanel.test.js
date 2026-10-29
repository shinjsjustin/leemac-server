import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartListsPanel from './PartListsPanel';

global.IS_REACT_ACT_ENVIRONMENT = true;

const LISTS = [
  { id: 1, name: 'Brackets', created_by_name: 'Ann', updated_by_name: 'Bob', part_ids: [1] },
  { id: 2, name: 'Gears', created_by_name: 'Cy', updated_by_name: 'Di', part_ids: [] },
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
    selectedId: null,
    onSelect: jest.fn(),
    onCreate: jest.fn().mockResolvedValue(true),
    onRename: jest.fn().mockResolvedValue(true),
    onDelete: jest.fn().mockResolvedValue(true),
    isBusy: false,
    ...over,
  };
  view = render(<PartListsPanel {...props} />);
  return view.container;
};
afterEach(() => view && view.unmount());

describe('PartListsPanel', () => {
  it('creates a list with the trimmed name, disables Add when blank and clears on success', async () => {
    const c = mount();
    const input = c.querySelector('input');
    const add = buttonByText(c, 'Add list');
    expect(add.disabled).toBe(true);
    type(input, '   ');
    expect(buttonByText(c, 'Add list').disabled).toBe(true);
    type(input, '  Valves ');
    click(buttonByText(c, 'Add list'));
    await flush();
    expect(props.onCreate).toHaveBeenCalledWith('Valves');
    expect(c.querySelector('input').value).toBe('');
  });

  it('keeps the typed name when creating fails', async () => {
    const c = mount({ onCreate: jest.fn().mockResolvedValue(false) });
    type(c.querySelector('input'), 'Valves');
    click(buttonByText(c, 'Add list'));
    await flush();
    expect(c.querySelector('input').value).toBe('Valves');
  });

  it('renders a card per list with select button, creator, editor and Request only when given', () => {
    let c = mount({ selectedId: 2 });
    const cards = c.querySelectorAll('.portal-list-card');
    expect(cards).toHaveLength(2);
    expect(c.querySelector('.portal-card')).toBeNull();
    expect(cards[0].textContent).toContain('Created by Ann');
    expect(cards[0].textContent).toContain('Edited by Bob');
    expect(buttonByText(cards[0], 'Request')).toBeUndefined();
    click(buttonByText(cards[0], 'Brackets'));
    expect(props.onSelect).toHaveBeenCalledWith(1);
    expect(buttonByText(cards[0], 'Brackets').getAttribute('aria-pressed')).toBe('false');
    expect(buttonByText(cards[1], 'Gears').getAttribute('aria-pressed')).toBe('true');
    view.unmount();
    const onRequest = jest.fn();
    c = mount({ onRequest });
    click(buttonByText(c.querySelectorAll('.portal-list-card')[1], 'Request'));
    expect(onRequest).toHaveBeenCalledWith(2);
  });

  it('asks before deleting and only deletes on Delete list', async () => {
    const c = mount();
    const card = () => c.querySelectorAll('.portal-list-card')[0];
    click(buttonByText(card(), 'Delete'));
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(card().textContent).toContain('Keep');
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
    const card = () => c.querySelectorAll('.portal-list-card')[0];
    click(buttonByText(card(), 'Delete'));
    click(buttonByText(card(), 'Delete list'));
    await flush();
    expect(buttonByText(card(), 'Delete list')).toBeDefined();
  });

  it('edits the name in an input and Save renames, leaving edit mode on success', async () => {
    const c = mount();
    const card = () => c.querySelectorAll('.portal-list-card')[0];
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
    const card = () => c.querySelectorAll('.portal-list-card')[0];
    click(buttonByText(card(), 'Edit'));
    click(buttonByText(card(), 'Save'));
    await flush();
    expect(card().querySelector('input')).not.toBeNull();
  });

  it('toggle flips aria-expanded and the collapsed class and shows the count', () => {
    const c = mount();
    const root = c.querySelector('aside.portal-lists');
    const toggle = () => c.querySelector('button.portal-lists-toggle');
    expect(toggle().textContent).toBe('Lists (2)');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(root.classList.contains('portal-lists--collapsed')).toBe(false);
    click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(root.classList.contains('portal-lists--collapsed')).toBe(true);
  });

  it('disables the actions while busy', () => {
    const c = mount({ isBusy: true });
    expect(buttonByText(c, 'Edit').disabled).toBe(true);
    expect(buttonByText(c, 'Delete').disabled).toBe(true);
  });
});
