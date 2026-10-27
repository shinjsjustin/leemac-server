import React from 'react';
import { render } from '../../testUtils/render';
import PortalField, { isBlank } from './PortalField';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mount = (props) => render(<PortalField label="Rev" {...props} />);

describe('PortalField', () => {
  it.each([[null], [undefined], [''], ['   ']])('renders nothing for %p', (value) => {
    const view = mount({ value });
    expect(view.container.querySelector('.portal-field')).toBeNull();
    expect(view.container.textContent).not.toContain('Rev');
    view.unmount();
  });

  it.each([[0, 'Rev 0'], ['A', 'Rev A'], ['B', 'Rev B'], [25, 'Rev 25']])(
    'renders label and value for %p',
    (value, expected) => {
      const view = mount({ value });
      const field = view.container.querySelector('.portal-field');
      expect(field.querySelector('.portal-field-label').textContent).toBe('Rev');
      expect(field.querySelector('.portal-field-value').textContent).toBe(String(value));
      expect(field.textContent).toBe(expected);
      view.unmount();
    }
  );

  it('reads "Qty 25" with one space between label and value', () => {
    const view = render(<PortalField label="Qty" value={25} />);
    expect(view.container.textContent).toBe('Qty 25');
    view.unmount();
  });

  it('shows children instead of the raw value', () => {
    const view = mount({ value: '2026-01-02T00:00:00Z', children: 'Jan 2, 2026' });
    expect(view.container.querySelector('.portal-field-value').textContent).toBe('Jan 2, 2026');
    expect(view.container.textContent).not.toContain('2026-01-02');
    view.unmount();
  });

  it('still hides when value is blank even with children', () => {
    const view = mount({ value: null, children: 'x' });
    expect(view.container.querySelector('.portal-field')).toBeNull();
    view.unmount();
  });
});

describe('isBlank', () => {
  it.each([[null, true], [undefined, true], ['', true], ['  \t', true], [0, false], ['A', false], [false, false]])(
    'isBlank(%p) is %p',
    (value, expected) => {
      expect(isBlank(value)).toBe(expected);
    }
  );
});
