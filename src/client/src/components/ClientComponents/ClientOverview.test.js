import React from 'react';
import { render } from '../../testUtils/render';
import ClientOverview from './ClientOverview';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('ClientOverview', () => {
  it('renders the Overview title inside the portal shell with Overview marked current', () => {
    const view = render(<ClientOverview />, { path: '/client-overview' });
    const c = view.container;
    expect(c.querySelector('.portal-shell h1').textContent).toBe('Overview');
    expect(c.querySelector('nav[aria-label="Portal"] a[aria-current="page"]').textContent).toBe('Overview');
    view.unmount();
  });
});
