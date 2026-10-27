import React from 'react';
import { render } from '../../testUtils/render';
import PortalMessage from './PortalMessage';

global.IS_REACT_ACT_ENVIRONMENT = true;

const text = (kind, message) => {
  const view = render(<PortalMessage kind={kind} message={message} />);
  const out = view.container.textContent;
  const links = [...view.container.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')]);
  view.unmount();
  return { out, links };
};

describe('PortalMessage', () => {
  it('renders distinct text for each kind', () => {
    const kinds = ['empty', 'not_found', 'signed_out', 'busy', 'error', 'loading'];
    const outs = kinds.map((k) => text(k).out);
    expect(new Set(outs).size).toBe(kinds.length);
    outs.forEach((o) => expect(o.length).toBeGreaterThan(0));
  });

  it('not_found says it could not find the job and links home', () => {
    const { out, links } = text('not_found');
    expect(out).toContain("We couldn't find that job");
    expect(links.map((l) => l[1])).toContain('/client-home');
  });

  it('signed_out links Sign in again to /client-login', () => {
    expect(text('signed_out').links).toEqual([['Sign in again', '/client-login']]);
  });

  it('busy and error prefer the given message', () => {
    expect(text('busy', 'Slow down please').out).toContain('Slow down please');
    expect(text('error', 'Boom happened').out).toContain('Boom happened');
  });

  it('empty ignores a given message and has no links', () => {
    const r = text('empty');
    expect(r.links).toEqual([]);
  });
});
