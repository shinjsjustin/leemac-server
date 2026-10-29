import React, { act } from 'react';
import { render } from '../../testUtils/render';
import StageControl from './StageControl';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setup = async (props = {}) => {
  const onSetStatus = jest.fn();
  const onSetFlag = jest.fn();
  let view;
  await act(async () => {
    view = render(<StageControl status="running_machine_a" since="08:12" onSetStatus={onSetStatus} onSetFlag={onSetFlag} {...props} />);
  });
  const c = view.container;
  return {
    c, onSetStatus, onSetFlag,
    click: (el) => act(async () => { el.click(); }),
    key: (k) => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }),
    seg: (label) => c.querySelector(`.stagebar button[title="${label}"]`),
    btn: (text) => [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === text),
  };
};

test('lights segments up to the current stage', async () => {
  const { c } = await setup();
  const segs = [...c.querySelectorAll('.stagebar button')];
  expect(segs).toHaveLength(11);
  expect(segs.map((b) => b.className)).toEqual([
    'past', 'past', 'past', 'cur', '', '', '', '', '', '', '',
  ]);
});

test('lights no segment when the status is open', async () => {
  const { c } = await setup({ status: 'open' });
  expect(c.querySelectorAll('.stagebar button.past, .stagebar button.cur')).toHaveLength(0);
  expect(c.querySelector('.chip').textContent).toContain('In the shop');
});

test('clicking a one-sub-step segment sets that sub-step at once', async () => {
  const { seg, click, onSetStatus, c } = await setup();
  await click(seg('Inspection'));
  expect(onSetStatus).toHaveBeenCalledWith('qa');
  expect(c.querySelector('.menu')).toBeNull();
});

test('a multi-sub-step segment opens a menu and a click picks a sub-step', async () => {
  const { seg, click, onSetStatus, c } = await setup();
  await click(seg('Outside finishing'));
  expect(onSetStatus).not.toHaveBeenCalled();
  const items = [...c.querySelectorAll('.menu button')];
  expect(items.map((b) => b.textContent)).toEqual(['At subvendor1', 'Waiting finish2']);
  await click(items[1]);
  expect(onSetStatus).toHaveBeenCalledWith('waiting_finish');
  expect(c.querySelector('.menu')).toBeNull();
});

test('keys 1-3 pick a sub-step and an out-of-range key does nothing', async () => {
  const { seg, click, key, onSetStatus, c } = await setup();
  await click(seg('Machining'));
  await key('4');
  expect(onSetStatus).not.toHaveBeenCalled();
  await key('3');
  expect(onSetStatus).toHaveBeenCalledWith('running_manual');
  expect(c.querySelector('.menu')).toBeNull();
});

test('Escape closes the menu without setting anything', async () => {
  const { seg, click, key, onSetStatus, c } = await setup();
  await click(seg('Machining'));
  await key('Escape');
  expect(c.querySelector('.menu')).toBeNull();
  expect(onSetStatus).not.toHaveBeenCalled();
});

test('the chip opens a menu of every stage and sub-step', async () => {
  const { c, click, onSetStatus } = await setup();
  await click(c.querySelector('.chip'));
  const items = [...c.querySelectorAll('.menu button')];
  expect(items).toHaveLength(16);
  await click(items.find((b) => b.textContent === 'Packing'));
  expect(onSetStatus).toHaveBeenCalledWith('packing');
  expect(c.querySelector('.menu')).toBeNull();
});

test('the chip shows the chip text', async () => {
  const { c } = await setup();
  expect(c.querySelector('.chip').textContent).toContain('Machining · Machine A');
});

test('Urgent and Waiting call onSetFlag with the opposite of the current value', async () => {
  const { btn, click, onSetFlag } = await setup({ urgent: true, waiting: false });
  await click(btn('Urgent'));
  expect(onSetFlag).toHaveBeenLastCalledWith('urgent', false);
  await click(btn('Waiting'));
  expect(onSetFlag).toHaveBeenLastCalledWith('waiting', true);
});

test('shows since time with a client-sees hint', async () => {
  const { c } = await setup();
  const seen = c.querySelector('.seen');
  expect(seen.textContent).toContain('since 08:12');
  expect(seen.querySelector('[title="Client sees this stage"]')).not.toBeNull();
});

test('disabled blocks segments, chip and flags', async () => {
  const { c, click, seg, onSetStatus, onSetFlag, btn } = await setup({ disabled: true });
  await click(seg('Inspection'));
  await click(btn('Urgent'));
  expect(onSetStatus).not.toHaveBeenCalled();
  expect(onSetFlag).not.toHaveBeenCalled();
  expect(c.querySelector('.chip').disabled).toBe(true);
});

describe('on a phone-width screen', () => {
  const original = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = jest.fn((query) => ({ matches: query === '(max-width: 600px)', media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  });
  afterEach(() => { window.matchMedia = original; });

  test('shows one large chip instead of the bar and opens the sheet', async () => {
    const { c, click, onSetStatus } = await setup();
    expect(c.querySelector('.stagebar')).toBeNull();
    expect(c.querySelector('.sheet')).toBeNull();
    const chip = c.querySelector('.chip.big');
    expect(chip.textContent).toContain('Machining · Machine A');
    await click(chip);
    expect(c.querySelector('.sheet')).not.toBeNull();
    await click([...c.querySelectorAll('.sheet .sub')].find((b) => b.textContent === 'Packing'));
    expect(onSetStatus).toHaveBeenCalledWith('packing');
    expect(c.querySelector('.sheet')).toBeNull();
  });

  test('sheet flags call onSetFlag', async () => {
    const { c, click, onSetFlag } = await setup({ urgent: false });
    await click(c.querySelector('.chip.big'));
    await click([...c.querySelectorAll('.sheet button')].find((b) => b.textContent === 'Urgent'));
    expect(onSetFlag).toHaveBeenCalledWith('urgent', true);
  });

  test('disabled chip does not open the sheet', async () => {
    const { c, click } = await setup({ disabled: true });
    await click(c.querySelector('.chip.big'));
    expect(c.querySelector('.sheet')).toBeNull();
  });
});
