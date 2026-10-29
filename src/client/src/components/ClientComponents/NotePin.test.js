import React, { act } from 'react';
import { render } from '../../testUtils/render';
import { NoteTarget } from './NotePin';
import { addNote } from '../../api/portalNotesApi';

jest.mock('../../api/portalNotesApi', () => ({ addNote: jest.fn() }));

global.IS_REACT_ACT_ENVIRONMENT = true;

const CLIENT_NOTE = { id: 1, content: 'Need by Friday', author: 'Jane Smith', is_client: true, mine: true, created_at: '2026-10-01T14:30:00Z' };
const LEEMAC_NOTE = { id: 2, content: 'Will do', author: 'Leemac', is_client: false, mine: false, created_at: '2026-10-02T09:00:00Z' };
const TARGET = { job_id: 7 };

let view;
let mobile;
const mount = (props) => {
  view = render(
    <NoteTarget notes={[CLIENT_NOTE]} target={TARGET} onAdded={jest.fn()} {...props}>
      <span>Row 13712</span>
    </NoteTarget>
  );
  return view.container;
};
const fire = (el, type, init) => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init })); });
const hover = (c) => fire(c.querySelector('.portal-pin-target'), 'mouseover');
const unhover = (c) => fire(c.querySelector('.portal-pin-target'), 'mouseout', { relatedTarget: document.body });
const advance = (ms) => act(() => { jest.advanceTimersByTime(ms); });
const card = (c) => c.querySelector('.portal-pin-card');
const typeInto = (input, value) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

beforeEach(() => {
  jest.useFakeTimers();
  mobile = false;
  window.matchMedia = jest.fn(() => ({ matches: mobile }));
  window.innerWidth = 1200;
  jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 400, top: 0, bottom: 40 });
  addNote.mockReset().mockResolvedValue({ ok: true, data: { id: 9 } });
});
afterEach(() => {
  view.unmount();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('NoteTarget', () => {
  it('renders only the children when there are no notes and replies are off', () => {
    const c = mount({ notes: [], allowReply: false });
    expect(c.textContent).toBe('Row 13712');
    expect(c.querySelector('.portal-pin')).toBeNull();
  });

  it('still shows a pin with count 0 when there are no notes but replies are allowed', () => {
    const c = mount({ notes: [] });
    expect(c.querySelector('.portal-pin').textContent).toContain('0');
  });

  it('shows the count, light for client-only notes and filled when any note is from Leemac', () => {
    const c = mount();
    expect(c.querySelector('.portal-pin').textContent).toContain('1');
    expect(c.querySelector('.portal-pin--leemac')).toBeNull();
    view.unmount();
    const c2 = mount({ notes: [CLIENT_NOTE, LEEMAC_NOTE] });
    expect(c2.querySelector('.portal-pin').textContent).toContain('2');
    expect(c2.querySelector('.portal-pin--leemac')).not.toBeNull();
  });

  it('opens the card only after 300 ms of hovering anywhere on the target', () => {
    const c = mount();
    hover(c);
    advance(299);
    expect(card(c)).toBeNull();
    advance(1);
    expect(card(c)).not.toBeNull();
    expect(c.querySelector('.portal-pin-target').classList.contains('portal-pin-target--hot')).toBe(true);
  });

  it('never opens when the mouse leaves before 300 ms, and closes on leave', () => {
    const c = mount();
    hover(c);
    advance(200);
    unhover(c);
    advance(500);
    expect(card(c)).toBeNull();
    hover(c);
    advance(300);
    expect(card(c)).not.toBeNull();
    unhover(c);
    expect(card(c)).toBeNull();
  });

  it('opens when the pin takes focus', () => {
    const c = mount();
    act(() => { c.querySelector('.portal-pin').focus(); });
    expect(card(c)).not.toBeNull();
  });

  it('labels each note LEEMAC or the client initials with name and time', () => {
    const c = mount({ notes: [CLIENT_NOTE, LEEMAC_NOTE] });
    hover(c);
    advance(300);
    const labels = [...c.querySelectorAll('.portal-pin-note-tag')].map((n) => n.textContent);
    expect(labels).toEqual(['JS', 'LEEMAC']);
    const text = card(c).textContent;
    expect(text).toContain('Jane Smith');
    expect(text).toContain('Need by Friday');
    expect(c.querySelectorAll('time')).toHaveLength(2);
    expect(c.querySelector('time').getAttribute('datetime')).toBe(CLIENT_NOTE.created_at);
  });

  it('opens on the right when there is room beside the target', () => {
    const c = mount();
    hover(c);
    advance(300);
    expect(card(c).getAttribute('data-side')).toBe('right');
  });

  it('opens on the left when the target right edge is within the card width of the window edge', () => {
    window.innerWidth = 650; // 650 - 400 = 250 < 300
    const c = mount();
    hover(c);
    advance(300);
    expect(card(c).getAttribute('data-side')).toBe('left');
  });

  it('sends the reply with the target, then clears the field and calls onAdded', async () => {
    const onAdded = jest.fn();
    const c = mount({ onAdded });
    hover(c);
    advance(300);
    const input = c.querySelector('textarea');
    typeInto(input, 'Thanks');
    await act(async () => { c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(addNote).toHaveBeenCalledWith(TARGET, 'Thanks');
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(c.querySelector('textarea').value).toBe('');
  });

  it('shows the error message and keeps the text when the reply fails', async () => {
    addNote.mockResolvedValue({ ok: false, error: { kind: 'invalid', message: 'content must be 1-255 characters' } });
    const onAdded = jest.fn();
    const c = mount({ onAdded });
    hover(c);
    advance(300);
    typeInto(c.querySelector('textarea'), 'x'.repeat(300));
    await act(async () => { c.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(c.querySelector('[role="alert"]').textContent).toBe('content must be 1-255 characters');
    expect(c.querySelector('textarea').value).toBe('x'.repeat(300));
    expect(onAdded).not.toHaveBeenCalled();
  });

  it('opens a bottom sheet with a close button on tap under 600px, and ignores hover', () => {
    mobile = true;
    const c = mount();
    hover(c);
    advance(300);
    expect(card(c)).toBeNull();
    act(() => { c.querySelector('.portal-pin').click(); });
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 599px)');
    const sheet = c.querySelector('.portal-pin-sheet');
    expect(sheet.textContent).toContain('Need by Friday');
    act(() => { sheet.querySelector('button[aria-label="Close notes"]').click(); });
    expect(c.querySelector('.portal-pin-sheet')).toBeNull();
  });

  it('does not open a sheet on tap at desktop width', () => {
    const c = mount();
    act(() => { c.querySelector('.portal-pin').click(); });
    expect(c.querySelector('.portal-pin-sheet')).toBeNull();
  });
});
