import React, { act } from 'react';
import { render } from '../../testUtils/render';
import StageSheet from './StageSheet';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setup = async (props = {}) => {
  const fns = { onSetStatus: jest.fn(), onSetFlag: jest.fn(), onClose: jest.fn() };
  let view;
  await act(async () => {
    view = render(<StageSheet open status="running_machine_a" urgent waiting={false} {...fns} {...props} />);
  });
  const c = view.container;
  return {
    c, ...fns,
    click: (el) => act(async () => { el.click(); }),
    key: (k) => act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); }),
    btn: (text) => [...c.querySelectorAll('.sheet button')].find((b) => b.textContent.trim() === text),
  };
};

test('renders nothing when closed', async () => {
  const { c } = await setup({ open: false });
  expect(c.querySelector('.sheet')).toBeNull();
  expect(c.querySelector('.sheet-backdrop')).toBeNull();
});

test('lists every stage with Korean label and every sub-step, marking the current one', async () => {
  const { c } = await setup();
  const heads = [...c.querySelectorAll('.sheet h6')].map((h) => h.textContent);
  expect(heads).toHaveLength(11);
  expect(heads[3]).toBe('Machining 가공');
  expect(c.querySelectorAll('.sheet .sub')).toHaveLength(16);
  expect([...c.querySelectorAll('.sheet .sub.on')].map((b) => b.textContent)).toEqual(['Machine A']);
});

test('picking a sub-step sets it and closes', async () => {
  const { btn, click, onSetStatus, onClose } = await setup();
  await click(btn('Manual'));
  expect(onSetStatus).toHaveBeenCalledWith('running_manual');
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Urgent and Waiting toggle to the opposite value and close', async () => {
  const { btn, click, onSetFlag, onClose } = await setup();
  await click(btn('Urgent'));
  expect(onSetFlag).toHaveBeenLastCalledWith('urgent', false);
  await click(btn('Waiting'));
  expect(onSetFlag).toHaveBeenLastCalledWith('waiting', true);
  expect(onClose).toHaveBeenCalledTimes(2);
});

test('backdrop click and Escape close without setting anything', async () => {
  const { c, click, key, onClose, onSetStatus, onSetFlag } = await setup();
  await click(c.querySelector('.sheet-backdrop'));
  expect(onClose).toHaveBeenCalledTimes(1);
  await key('Escape');
  expect(onClose).toHaveBeenCalledTimes(2);
  await key('a');
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(onSetStatus).not.toHaveBeenCalled();
  expect(onSetFlag).not.toHaveBeenCalled();
});

test('clicking inside the sheet does not close it', async () => {
  const { c, click, onClose } = await setup();
  await click(c.querySelector('.sheet h6'));
  expect(onClose).not.toHaveBeenCalled();
});
