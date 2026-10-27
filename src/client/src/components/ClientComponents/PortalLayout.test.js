import React from 'react';
import { render } from '../../testUtils/render';
import PortalLayout from './PortalLayout';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mount = (props) => render(<PortalLayout title="Your jobs" {...props}><p>body</p></PortalLayout>);

describe('PortalLayout', () => {
  it('renders the shell, logo, single h1, nav links and Log out when signed in', () => {
    const view = mount();
    const c = view.container;
    expect(c.querySelector('.portal-shell')).not.toBeNull();
    expect(c.querySelector('img[alt="Leemac"]')).not.toBeNull();
    const h1s = c.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toBe('Your jobs');
    const links = [...c.querySelectorAll('nav[aria-label="Portal"] a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Your jobs', '/client-home'],
      ['Account', '/client-update-credentials'],
    ]);
    const buttons = [...c.querySelectorAll('nav button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Log out']);
    expect(c.textContent).toContain('body');
    view.unmount();
  });

  it('renders only logo and title when signedIn is false', () => {
    const view = mount({ signedIn: false });
    const c = view.container;
    expect(c.querySelector('img[alt="Leemac"]')).not.toBeNull();
    expect(c.querySelector('h1').textContent).toBe('Your jobs');
    expect(c.querySelector('nav')).toBeNull();
    expect(c.querySelector('button')).toBeNull();
    expect(c.textContent).not.toContain('Log out');
    expect(c.querySelector('.navbar')).toBeNull();
    // the only link is the logo link home
    expect([...c.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/client-home']);
    view.unmount();
  });
});
