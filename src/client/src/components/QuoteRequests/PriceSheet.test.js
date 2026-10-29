import React, { act } from 'react';
import { Simulate } from 'react-dom/test-utils';
import { render } from '../../testUtils/render';
import PriceSheet from './PriceSheet';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LINES = [
  { id: 1, part_number: 'A-1', quantity: 2, price: '5.00' },
  { id: 2, part_number: 'B-2', quantity: 3, price: '' },
  { id: 3, part_number: 'C-3', quantity: 1, price: null },
  { id: 4, part_number: 'D-4', quantity: 1, price: '' },
];
const MATCHES = {
  2: [{ id: 9, history: [
    { price: '7.10', created_at: '2026-01-01T00:00:00' },
    { price: '8.25', created_at: '2026-06-01T00:00:00' },
  ] }],
  3: [{ id: 10, history: [] }],
};

let view;
const mount = async (props = {}) => {
  const onPrice = jest.fn();
  await act(async () => {
    view = render(<PriceSheet lines={LINES} matches={MATCHES} onPrice={onPrice} {...props} />);
  });
  return onPrice;
};
const inputs = () => [...view.container.querySelectorAll('input')];
const byLabel = (label) => view.container.querySelector(`input[aria-label="${label}"]`);
afterEach(() => view?.unmount());

test('renders one price input per line in line order, empty ones marked', async () => {
  await mount();
  expect(inputs().map((i) => i.getAttribute('aria-label'))).toEqual(['A-1', 'B-2', 'C-3', 'D-4']);
  expect(inputs().map((i) => i.value)).toEqual(['5.00', '', '', '']);
  expect(inputs().map((i) => i.classList.contains('empty'))).toEqual([false, true, true, true]);
});

test('typing a price reports the line id and value', async () => {
  const onPrice = await mount();
  await act(async () => { Simulate.change(byLabel('B-2'), { target: { value: '3.5' } }); });
  expect(onPrice).toHaveBeenCalledWith(2, '3.5');
});

test('Enter on an empty price fills the newest past price', async () => {
  const onPrice = await mount();
  await act(async () => { Simulate.keyDown(byLabel('B-2'), { key: 'Enter' }); });
  expect(onPrice).toHaveBeenCalledWith(2, '8.25');
});

test('Enter does nothing without history or on a priced line', async () => {
  const onPrice = await mount();
  await act(async () => { Simulate.keyDown(byLabel('C-3'), { key: 'Enter' }); });
  await act(async () => { Simulate.keyDown(byLabel('A-1'), { key: 'Enter' }); });
  expect(onPrice).not.toHaveBeenCalled();
});

test('footer counts lines, priced and the part numbers that need a price', async () => {
  await mount();
  expect(view.container.querySelector('.ps-foot').textContent)
    .toBe('4 lines · 1 priced · 3 needs a price (B-2, C-3, D-4)');
});

test('Use last price on matched lines fills only empty prices that have history', async () => {
  const onPrice = await mount();
  const btn = [...view.container.querySelectorAll('button')].find((b) => b.textContent === 'Use last price on matched lines');
  await act(async () => { btn.click(); });
  expect(onPrice.mock.calls).toEqual([[2, '8.25']]);
});

test('disabled disables inputs and the bulk button', async () => {
  await mount({ disabled: true });
  expect(inputs().every((i) => i.disabled)).toBe(true);
  expect(view.container.querySelector('button').disabled).toBe(true);
});
