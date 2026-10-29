import React, { act } from 'react';
import { render } from '../../testUtils/render';
import FinanceHeadline from './FinanceHeadline';
import { apiFetch } from '../../api/apiFetch';

jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PERIODS = [
  { id: 4, year: 2026, quarter: 4 },
  { id: 3, year: 2026, quarter: 3 },
  { id: 2, year: 2025, quarter: 4 },
];
const SUMMARY = {
  invoiced: { count: 23, total: 84210 },
  paid: { count: 14, total: 52730 },
  waiting: { count: 9, total: 31480, over_30: 3 },
  expenses: { count: 41, total: 18906 },
  profit: 33824,
  months: [
    { month: '2026-10', invoiced: 80000, expenses: 20000 },
    { month: '2026-11', invoiced: 40000, expenses: 10000 },
    { month: '2026-12', invoiced: 0, expenses: 0 },
  ],
};
const reply = (body) => ({ status: 200, ok: true, json: async () => body });
const mount = async (props = {}) => {
  const onSelect = jest.fn();
  let view;
  const ui = (p) => <FinanceHeadline periods={PERIODS} period={PERIODS[0]} onSelect={onSelect} refreshKey={0} {...p} />;
  await act(async () => { view = render(ui(props)); });
  return { c: view.container, onSelect };
};
const button = (c, text) => [...c.querySelectorAll('button')].find((b) => b.textContent.startsWith(text));

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async () => reply(SUMMARY));
});

test('fetches the quarter summary for the chosen period', async () => {
  await mount();
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(apiFetch).toHaveBeenCalledWith('/internal/finances/periods/4/quarter');
});

test('shows the five cards with counts and sums', async () => {
  const { c } = await mount();
  const text = c.textContent;
  expect(text).toContain('$84,210');
  expect(text).toContain('23 invoices');
  expect(text).toContain('$52,730');
  expect(text).toContain('14 invoices');
  expect(text).toContain('$31,480');
  expect(text).toContain('9 invoices · 3 over 30 days');
  expect(text).toContain('$18,906');
  expect(text).toContain('41 expenses');
  expect(text).toContain('Profit (paid − expenses)');
  expect(text).toContain('$33,824');
  expect(text).toContain('$52,730 − $18,906');
});

test('draws an invoiced and an expenses bar per month scaled to the largest value', async () => {
  const { c } = await mount();
  const groups = c.querySelectorAll('.fh-months > div');
  expect(groups).toHaveLength(3);
  expect(groups[0].querySelector('i.inv').style.height).toBe('100%');
  expect(groups[0].querySelector('i.exp').style.height).toBe('25%');
  expect(groups[1].querySelector('i.inv').style.height).toBe('50%');
  expect(groups[2].querySelectorAll('i')).toHaveLength(2);
  expect(groups[2].querySelector('i.inv').style.height).toBe('0%');
  expect([...groups].map((g) => g.querySelector('em').textContent)).toEqual(['Oct', 'Nov', 'Dec']);
});

test('shows years and quarters of the chosen year, disabling quarters with no period', async () => {
  const { c } = await mount();
  expect(button(c, '2025')).toBeTruthy();
  expect(button(c, '2026').className).toContain('on');
  expect(button(c, 'Q1').disabled).toBe(true);
  expect(button(c, 'Q3').disabled).toBe(false);
  expect(button(c, 'Q4').className).toContain('on');
});

test('selecting a quarter calls onSelect with that period', async () => {
  const { c, onSelect } = await mount();
  await act(async () => { button(c, 'Q3').click(); });
  expect(onSelect).toHaveBeenCalledWith(PERIODS[1]);
});

test('selecting a year calls onSelect with its latest period', async () => {
  const { c, onSelect } = await mount();
  await act(async () => { button(c, '2025').click(); });
  expect(onSelect).toHaveBeenCalledWith(PERIODS[2]);
});

test('refetches when the period or refreshKey changes', async () => {
  let setProps;
  const Harness = () => {
    const [props, set] = React.useState({ period: PERIODS[0], refreshKey: 0 });
    setProps = set;
    return <FinanceHeadline periods={PERIODS} onSelect={jest.fn()} {...props} />;
  };
  await act(async () => { render(<Harness />); });
  expect(apiFetch).toHaveBeenCalledTimes(1);
  await act(async () => { setProps({ period: PERIODS[1], refreshKey: 0 }); });
  expect(apiFetch).toHaveBeenLastCalledWith('/internal/finances/periods/3/quarter');
  await act(async () => { setProps({ period: PERIODS[1], refreshKey: 1 }); });
  expect(apiFetch).toHaveBeenCalledTimes(3);
});
