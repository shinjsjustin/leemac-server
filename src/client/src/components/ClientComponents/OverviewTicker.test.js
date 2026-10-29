import React from 'react';
import { render } from '../../testUtils/render';
import OverviewTicker from './OverviewTicker';

global.IS_REACT_ACT_ENVIRONMENT = true;

const at = (h, m) => new Date(2026, 9, 29, h, m).toISOString();
const entries = [
  { at: at(9, 5), job_number: 'J-11', part_number: 'HSX-1', stage: { key: 'inspection', label: 'Inspection' }, own: true },
  { at: at(8, 40), job_number: 'X-99', stage: { key: 'packing', label: 'Packing' } },
];

let view;
afterEach(() => view && view.unmount());
const mount = (list) => {
  view = render(<OverviewTicker entries={list} />);
  return view.container;
};

describe('OverviewTicker', () => {
  it('shows time, job number, own part number and stage label in given order', () => {
    const items = mount(entries).querySelectorAll('.portal-ticker-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('09:05J-11HSX-1Inspection');
    expect(items[1].textContent).toBe('08:40X-99Packing');
  });

  it('shows the Live dot', () => {
    expect(mount(entries).querySelector('.portal-ticker-live').textContent).toBe('Live');
  });

  it('shows No changes this week when empty', () => {
    const c = mount([]);
    expect(c.textContent).toContain('No changes this week');
    expect(c.querySelectorAll('.portal-ticker-item')).toHaveLength(0);
  });
});
