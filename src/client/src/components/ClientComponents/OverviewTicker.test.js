import React from 'react';
import { render } from '../../testUtils/render';
import OverviewTicker from './OverviewTicker';

global.IS_REACT_ACT_ENVIRONMENT = true;

const entry = { at: '2026-03-17 13:00:00', job_number: '13706', stage: { key: 'delivered', label: 'Delivered' } };

test('identical entries render without duplicate key warnings', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const view = render(<OverviewTicker entries={[entry, { ...entry }]} />);
  expect(view.container.querySelectorAll('.portal-ticker-item')).toHaveLength(2);
  expect(spy).not.toHaveBeenCalled();
  view.unmount();
  spy.mockRestore();
});

const at = (...args) => new Date(...args).toISOString();

test('shows local short weekday and 24-hour time', () => {
  const view = render(<OverviewTicker entries={[{ ...entry, at: at(2026, 10, 2, 9, 56) }]} />);
  expect(view.container.querySelector('.portal-ticker-time').textContent).toBe('Mon 09:56');
  view.unmount();
});

test('renders entries in the order given', () => {
  const entries = [
    { ...entry, at: at(2026, 10, 2, 9, 56), job_number: 'A1' },
    { ...entry, at: at(2026, 10, 1, 14, 5), job_number: 'B2' },
    { ...entry, at: at(2026, 9, 30, 8, 0), job_number: 'C3' },
  ];
  const view = render(<OverviewTicker entries={entries} />);
  const jobs = [...view.container.querySelectorAll('.portal-ticker-job')].map((n) => n.textContent);
  expect(jobs).toEqual(['A1', 'B2', 'C3']);
  view.unmount();
});

test('empty text covers the last 7 days', () => {
  const view = render(<OverviewTicker entries={[]} />);
  expect(view.container.querySelector('.portal-ticker-empty').textContent).toBe('No shop moves in the last 7 days');
  view.unmount();
});
