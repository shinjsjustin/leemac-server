import React from 'react';
import { render } from '../../testUtils/render';
import ClientTwoFactor from './ClientTwoFactor';

global.IS_REACT_ACT_ENVIRONMENT = true;

let view;
beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => view && view.unmount());

describe('ClientTwoFactor', () => {
  it('renders inside the portal shell with a labelled one-time-code input', () => {
    view = render(<ClientTwoFactor />);
    const c = view.container;
    expect(c.querySelector('.portal-shell')).not.toBeNull();
    expect(c.querySelector('nav')).toBeNull();
    const input = c.querySelector('input.portal-input');
    expect(input.id).toBeTruthy();
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    const label = c.querySelector(`label.portal-label[for="${input.id}"]`);
    expect(label).not.toBeNull();
  });
});
