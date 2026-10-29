import React, { act } from 'react';
import { render } from '../../testUtils/render';
import PartWall from './PartWall';

jest.mock('./DrawingTile', () => ({ file }) => <div data-testid="tile">{file ? file.filename : 'none'}</div>);

global.IS_REACT_ACT_ENVIRONMENT = true;

const part = (id, over = {}) => ({
  part_id: id,
  part_number: `PN-${id}`,
  part_description: `Bracket ${id}`,
  latest_drawing: { id: id * 10, filename: `d${id}.pdf` },
  latest: {
    job_part_id: id, job_id: 100 + id, job_number: `J-${id}`, rev: 'B', material: 'Al', finish: null,
    quantity: 25, stage: { key: 'machining', label: 'Machining' },
  },
  ...over,
});
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const key = (el, k) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  act(() => { el.dispatchEvent(event); });
  return event;
};

let view;
let props;
const mount = (over = {}) => {
  props = { parts: [part(1), part(2)], view: 'drawings', selectedIds: [], onToggle: jest.fn(), onOpen: jest.fn(), notes: {}, onNoteAdded: jest.fn(), ...over };
  view = render(<PartWall {...props} />);
  return view.container;
};
afterEach(() => view && view.unmount());

describe('PartWall drawings view', () => {
  it('shows tile, number, rev, stage, description and job number on a card', () => {
    const c = mount();
    const card = c.querySelector('.portal-part-card');
    expect(card.querySelector('[data-testid="tile"]').textContent).toBe('d1.pdf');
    expect(card.textContent).toContain('PN-1');
    expect(card.textContent).toContain('Rev B');
    expect(card.textContent).toContain('Machining');
    expect(card.textContent).toContain('Bracket 1');
    expect(card.textContent).toContain('J-1');
    expect(card.textContent).not.toMatch(/price/i);
  });

  it('hides empty values', () => {
    const c = mount({ parts: [part(1, { part_description: ' ', latest: { ...part(1).latest, rev: null, job_number: '' } })] });
    const card = c.querySelector('.portal-part-card');
    expect(card.textContent).not.toContain('Rev');
    expect(card.querySelector('.portal-part-desc')).toBeNull();
    expect(card.querySelector('.portal-part-job')).toBeNull();
  });

  it('opens the part on card click', () => {
    const c = mount();
    click(c.querySelectorAll('.portal-part-card')[1]);
    expect(props.onOpen).toHaveBeenCalledWith(props.parts[1]);
  });

  it('toggles by checkbox without opening, and marks selected cards', () => {
    const c = mount({ selectedIds: [2] });
    click(c.querySelector('input[type=checkbox]'));
    expect(props.onToggle).toHaveBeenCalledWith(1);
    expect(props.onOpen).not.toHaveBeenCalled();
    const cards = c.querySelectorAll('.portal-part-card');
    expect(cards[0].classList.contains('portal-part-card--selected')).toBe(false);
    expect(cards[1].classList.contains('portal-part-card--selected')).toBe(true);
  });

  it('wraps each card in a note target for its part', () => {
    const c = mount({ notes: { 1: [{ id: 1, author: 'A B', content: 'hi', is_client: true, created_at: '2026-01-01T00:00:00Z' }] } });
    const pins = c.querySelectorAll('.portal-pin');
    expect(pins).toHaveLength(1);
    expect(pins[0].textContent).toBe('1');
  });
});

describe('PartWall card lines', () => {
  const lines = (c) => {
    const card = c.querySelector('.portal-part-card');
    return { head: card.querySelector('.portal-part-head'), desc: card.querySelector('.portal-part-desc'), facts: card.querySelector('.portal-part-facts') };
  };
  const withJobs = (n, over = {}) => part(1, { jobs: Array.from({ length: n }, (_, i) => ({ job_id: i })), latest: { ...part(1).latest, finish: 'Anodized', ...over } });

  it('puts number, rev chip, stage and job number on the head line', () => {
    const { head } = lines(mount());
    expect(head.querySelector('.portal-part-num').textContent).toBe('PN-1');
    expect(head.querySelector('.portal-part-rev').textContent).toBe('Rev B');
    expect(head.textContent).toContain('Machining');
    expect(head.querySelector('.portal-part-job').textContent).toBe('J-1');
  });

  it('shows the description on its own line and material, finish, quantity and order count on the facts line', () => {
    const { desc, facts } = lines(mount({ parts: [withJobs(2)] }));
    expect(desc.textContent).toBe('Bracket 1');
    expect(facts.textContent).toContain('Al \u00b7 Anodized');
    expect(facts.textContent).toContain('\u00d725');
    expect(facts.textContent).toContain('2\u00d7 ordered');
  });

  it('hides each fact when blank or zero', () => {
    const { facts } = lines(mount({ parts: [withJobs(0, { material: ' ', finish: null, quantity: 0 })] }));
    expect(facts).toBeNull();
  });

  it('shows only material without a separator when finish is blank', () => {
    const { facts } = lines(mount({ parts: [withJobs(0, { finish: null, quantity: null })] }));
    expect(facts.textContent).toBe('Al');
  });

  it('omits the multiplication sign with no quantity and ordered text with no jobs', () => {
    const { facts } = lines(mount({ parts: [withJobs(0, { quantity: null })] }));
    expect(facts.textContent).not.toContain('\u00d7');
    expect(facts.textContent).not.toContain('ordered');
  });
});

describe('PartWall table view', () => {
  it('shows a row per part with columns', () => {
    const c = mount({ view: 'table' });
    const rows = c.querySelectorAll('.portal-part-row');
    expect(rows).toHaveLength(2);
    ['PN-1', 'B', 'Bracket 1', 'Machining', 'J-1', '25'].forEach((t) => expect(rows[0].textContent).toContain(t));
    expect(c.querySelector('.portal-part-card')).toBeNull();
  });

  it('opens and selects like cards', () => {
    const c = mount({ view: 'table', selectedIds: [1] });
    const row = c.querySelector('.portal-part-row');
    expect(row.classList.contains('portal-part-card--selected')).toBe(true);
    click(row.querySelector('input[type=checkbox]'));
    expect(props.onToggle).toHaveBeenCalledWith(1);
    expect(props.onOpen).not.toHaveBeenCalled();
    click(row);
    expect(props.onOpen).toHaveBeenCalledWith(props.parts[0]);
  });
});

describe.each(['drawings', 'table'])('PartWall keyboard in %s view', (mode) => {
  const sel = mode === 'table' ? '.portal-part-row' : '.portal-part-card';

  it('makes each item a focusable button', () => {
    const items = mount({ view: mode }).querySelectorAll(sel);
    expect(items).toHaveLength(2);
    items.forEach((el) => {
      expect(el.getAttribute('role')).toBe('button');
      expect(el.tabIndex).toBe(0);
    });
  });

  it.each(['Enter', ' '])('opens the part once on %j and prevents default', (k) => {
    const c = mount({ view: mode });
    const event = key(c.querySelectorAll(sel)[1], k);
    expect(props.onOpen).toHaveBeenCalledTimes(1);
    expect(props.onOpen).toHaveBeenCalledWith(props.parts[1]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores other keys', () => {
    const c = mount({ view: mode });
    key(c.querySelector(sel), 'a');
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it.each(['Enter', ' '])('does not open when %j is pressed on the checkbox', (k) => {
    const c = mount({ view: mode });
    const event = key(c.querySelector('input[type=checkbox]'), k);
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
