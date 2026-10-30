import React, { act } from 'react';
import { render } from '../../testUtils/render';
import OverviewRail from './OverviewRail';

global.IS_REACT_ACT_ENVIRONMENT = true;

const LISTS = [
  { id: 1, name: 'Brackets', part_ids: [1, 2] },
  { id: 2, name: 'Gears', part_ids: [3] },
];

const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent === text);
const allButtons = (c) => [...c.querySelectorAll('button.portal-overview-list')];
const listButtons = (c) => allButtons(c).slice(1);

let view;
let props;
const mount = (over = {}) => {
  props = {
    lists: LISTS,
    selectedListId: null,
    onSelectList: jest.fn(),
    onCreate: jest.fn().mockResolvedValue(true),
    isBusy: false,
    ...over,
  };
  view = render(<OverviewRail {...props} />);
  return view.container;
};
afterEach(() => view.unmount());

describe('OverviewRail', () => {
  it('shows a Lists heading and each list with its name and part count, with no tabs or part rows', () => {
    const c = mount();
    expect(c.querySelector('h2').textContent).toBe('Lists');
    expect(listButtons(c).map((b) => b.textContent)).toEqual(['Brackets2 parts', 'Gears1 parts']);
    expect(c.querySelector('[role="tab"]')).toBeNull();
    expect(c.querySelector('input[aria-label="Filter parts"]')).toBeNull();
  });

  it('puts All parts first, pressed when no list is picked, and clears the pick on click', () => {
    const c = mount();
    expect(allButtons(c)[0].textContent).toBe('All parts');
    expect(allButtons(c)[0].getAttribute('aria-pressed')).toBe('true');
    click(allButtons(c)[0]);
    expect(props.onSelectList).toHaveBeenCalledWith(null);
  });

  it('leaves All parts unpressed when a list is picked', () => {
    const c = mount({ selectedListId: 1 });
    expect(allButtons(c)[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('marks only the selected list aria-pressed', () => {
    const c = mount({ selectedListId: 2 });
    expect(listButtons(c).map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('calls onSelectList with the list id when a list is clicked', () => {
    const c = mount();
    click(listButtons(c)[1]);
    expect(props.onSelectList).toHaveBeenCalledWith(2);
  });

  it('calls onSelectList with null when the selected list is clicked again', () => {
    const c = mount({ selectedListId: 2 });
    click(listButtons(c)[1]);
    expect(props.onSelectList).toHaveBeenCalledWith(null);
  });

  it('creates a list from the name typed after + New list', async () => {
    const c = mount();
    click(button(c, '+ New list'));
    type(c.querySelector('input[aria-label="New list name"]'), 'Plates');
    await act(async () => { button(c, 'Create').click(); });
    expect(props.onCreate).toHaveBeenCalledWith('Plates');
  });
});
