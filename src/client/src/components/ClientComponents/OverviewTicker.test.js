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
