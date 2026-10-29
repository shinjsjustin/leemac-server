import React, { act } from 'react';
import { render } from '../../testUtils/render';
import QuoteRequestInbox from './QuoteRequestInbox';

jest.mock('../AdminLayout/AdminLayout', () => ({ children, current }) => <div data-testid="layout" data-current={current}>{children}</div>);
jest.mock('../QuoteRequests/RequestInboxRail', () => () => <div data-testid="rail" />);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('renders the rail beside a Pick a request panel inside AdminLayout', async () => {
  let view;
  await act(async () => {
    view = render(<QuoteRequestInbox />);
  });
  const layout = view.container.querySelector('[data-testid="layout"]');
  expect(layout.dataset.current).toBe('quote-requests');
  expect(layout.querySelector('[data-testid="rail"]')).not.toBeNull();
  expect(layout.textContent).toContain('Pick a request');
  view.unmount();
});
