import React from 'react';
import { render } from '../../testUtils/render';
import PortalLayout from './PortalLayout';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mount = (props, path) => render(<PortalLayout title="Your jobs" {...props}><p>body</p></PortalLayout>, { path });

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
      ['Overview', '/client-overview'],
      ['Your jobs', '/client-home'],
      ['Parts', '/client-parts'],
      ['Your requests', '/client-requests'],
      ['Account', '/client-update-credentials'],
    ]);
    const buttons = [...c.querySelectorAll('nav[aria-label="Portal"] button')].map((b) => b.textContent);
    expect(buttons).toEqual(['Log out']);
    const right = c.querySelector('nav[aria-label="Portal"] .portal-nav-account');
    expect([...right.children].map((e) => e.textContent)).toEqual(['Account', 'Log out']);
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

  it('renders back inside main before the h1', () => {
    const view = mount({ back: <a href="/client-home" data-testid="back">Back</a> });
    const c = view.container;
    const main = c.querySelector('main');
    const back = main.querySelector('[data-testid="back"]');
    expect(back).not.toBeNull();
    expect(back.compareDocumentPosition(main.querySelector('h1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    view.unmount();
  });

  it('renders titleAside in .portal-title-row alongside the single h1', () => {
    const view = mount({ titleAside: <span data-testid="aside">Active</span> });
    const c = view.container;
    const row = c.querySelector('main .portal-title-row');
    expect(row).not.toBeNull();
    expect(row.querySelectorAll('h1')).toHaveLength(1);
    expect(row.querySelector('[data-testid="aside"]').textContent).toBe('Active');
    expect(c.querySelectorAll('h1')).toHaveLength(1);
    view.unmount();
  });

  it('keeps one h1 and adds no extra nodes without back or titleAside', () => {
    const view = mount();
    const c = view.container;
    expect(c.querySelectorAll('h1')).toHaveLength(1);
    expect(c.querySelector('.portal-title-row').children).toHaveLength(1);
    expect(c.querySelector('main').children).toHaveLength(2);
    view.unmount();
  });

  it('renders a Tabs nav with Jobs, Parts, Requests and Account links', () => {
    const view = mount();
    const tabs = view.container.querySelectorAll('nav[aria-label="Tabs"]');
    expect(tabs).toHaveLength(1);
    expect([...tabs[0].querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Jobs', '/client-home'],
      ['Parts', '/client-parts'],
      ['Requests', '/client-requests'],
      ['Account', '/client-update-credentials'],
    ]);
    view.unmount();
  });

  it.each([
    ['/client-overview', ['Overview'], []],
    ['/client-home', ['Your jobs'], ['Jobs']],
    ['/client-job/4', ['Your jobs'], ['Jobs']],
    ['/client-parts', ['Parts'], ['Parts']],
    ['/client-part/9', ['Parts'], ['Parts']],
    ['/client-requests', ['Your requests'], ['Requests']],
    ['/client-request/new', ['Your requests'], ['Requests']],
    ['/client-request/3', ['Your requests'], ['Requests']],
    ['/client-update-credentials', ['Account'], ['Account']],
    ['/elsewhere', [], []],
  ])('at %s marks only %j in Portal and %j in Tabs as current', (path, portal, tabs) => {
    const view = mount({}, path);
    const current = (label) => [...view.container.querySelectorAll(`nav[aria-label="${label}"] a[aria-current="page"]`)].map((a) => a.textContent);
    expect(current('Portal')).toEqual(portal);
    expect(current('Tabs')).toEqual(tabs);
    view.unmount();
  });
});
