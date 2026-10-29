import React, { act } from 'react';
import { Simulate } from 'react-dom/test-utils';
import { render } from '../../testUtils/render';
import ReviewGrid from './ReviewGrid';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LINE = {
  id: 7,
  part_number: 'A1',
  description: 'bracket',
  rev: 'B',
  material: 'AL',
  finish: 'anodize',
  quantity: 5,
  price: 12.5,
  bourne_suggestion: {},
  files: [],
};

const mount = (props) => {
  let view;
  act(() => {
    view = render(<ReviewGrid lines={[LINE]} onChange={() => {}} {...props} />);
  });
  return view;
};

const byLabel = (container, text) =>
  [...container.querySelectorAll('label')].find((l) => l.textContent === text);

test('labels inputs for all seven fields with number types for quantity and price', () => {
  const { container } = mount();
  const expected = {
    'Part number': 'A1', Description: 'bracket', Rev: 'B', Material: 'AL',
    Finish: 'anodize', Quantity: '5', Price: '12.5',
  };
  Object.entries(expected).forEach(([label, value]) => {
    const input = container.querySelector(`#${byLabel(container, label).htmlFor}`);
    expect(input.value).toBe(value);
  });
  const price = container.querySelector(`#${byLabel(container, 'Price').htmlFor}`);
  expect(price.type).toBe('number');
  expect(price.step).toBe('0.01');
  expect(container.querySelector(`#${byLabel(container, 'Quantity').htmlFor}`).type).toBe('number');
});

test('editing a field calls onChange with the updated lines', () => {
  const onChange = jest.fn();
  const { container } = mount({ onChange });
  const input = container.querySelector(`#${byLabel(container, 'Material').htmlFor}`);
  act(() => Simulate.change(input, { target: { value: 'SS' } }));
  expect(onChange).toHaveBeenCalledWith([{ ...LINE, material: 'SS' }]);
});

test('shows a hint for differing suggestions only and applies it on Use click', () => {
  const onChange = jest.fn();
  const line = {
    ...LINE,
    bourne_suggestion: { rev: 'C', material: 'AL', finish: 'black', price: 99 },
  };
  const { container } = mount({ lines: [line], onChange });
  const text = container.textContent;
  expect(text).toContain('Bourne: C');
  expect(text).toContain('Bourne: black');
  expect(text).not.toContain('Bourne: AL');
  expect(text).not.toContain('99');
  expect(onChange).not.toHaveBeenCalled();
  const uses = [...container.querySelectorAll('button')].filter((b) => b.textContent === 'Use');
  expect(uses).toHaveLength(2);
  act(() => Simulate.click(uses[0]));
  expect(onChange).toHaveBeenCalledWith([{ ...line, rev: 'C' }]);
});

test('lists matches linking to the part with job numbers, or New part when empty', () => {
  const matches = {
    7: [{ part_id: 3, number: 'A1', jobs: [{ id: 1, job_number: 'J100' }, { id: 2, job_number: 'J200' }] }],
  };
  const view = mount({ matches });
  const link = view.container.querySelector('a');
  expect(link.getAttribute('href')).toBe('/part/3');
  expect(link.textContent).toBe('A1');
  expect(view.container.textContent).toContain('J100');
  expect(view.container.textContent).toContain('J200');
  expect(view.container.textContent).not.toContain('New part');
  view.unmount();

  const empty = mount({ matches: { 7: [] } });
  expect(empty.container.textContent).toContain('New part');
  expect(empty.container.querySelector('a')).toBeNull();
  empty.unmount();

  const unchecked = mount();
  expect(unchecked.container.textContent).not.toContain('New part');
  unchecked.unmount();
});

test('line files open via onOpenFile and errors show on their line', () => {
  const file = { id: 4, filename: 'dwg.pdf' };
  const onOpenFile = jest.fn();
  const { container } = mount({
    lines: [{ ...LINE, files: [file] }],
    onOpenFile,
    errors: { 7: 'Price is required' },
  });
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'dwg.pdf');
  act(() => Simulate.click(button));
  expect(onOpenFile).toHaveBeenCalledWith(file);
  expect(container.textContent).toContain('Price is required');
});

test('readOnly renders text without inputs or Use buttons', () => {
  const line = { ...LINE, bourne_suggestion: { rev: 'C' } };
  const { container } = mount({ lines: [line], readOnly: true });
  expect(container.querySelector('input')).toBeNull();
  expect(container.textContent).toContain('bracket');
  expect(container.textContent).toContain('12.5');
  expect(container.textContent).not.toContain('Use');
});

const DRAWING = { id: 9, filename: 'part.pdf' };

test('part drawings open via onOpenPartFile under a Part drawings label', () => {
  const onOpenPartFile = jest.fn();
  const { container } = mount({ lines: [{ ...LINE, part_files: [DRAWING] }], onOpenPartFile });
  expect(container.textContent).toContain('Part drawings');
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'part.pdf');
  act(() => Simulate.click(button));
  expect(onOpenPartFile).toHaveBeenCalledWith(DRAWING);
});

test('no Part drawings label when the line has no part files', () => {
  const { container } = mount({ lines: [{ ...LINE, part_files: [] }] });
  expect(container.textContent).not.toContain('Part drawings');
});

test.each([
  ['differs', { source_part_id: 3, source_part_number: 'P-1', part_number: 'P-2' }, true],
  ['is cleared', { source_part_id: 3, source_part_number: 'P-1', part_number: null }, true],
  ['matches', { source_part_id: 3, source_part_number: 'P-1', part_number: 'P-1' }, false],
  ['has no source part', { source_part_id: null, source_part_number: null, part_number: 'P-2' }, false],
])('edit warning when part number %s: %s', (_name, over, isShown) => {
  const { container } = mount({ lines: [{ ...LINE, ...over }] });
  const warning = container.querySelector('.review-warning');
  if (!isShown) return expect(warning).toBeNull();
  expect(warning.textContent).toBe(
    'Edited from P-1. The job will use the original part P-1; remove this line to drop it.'
  );
});

test('Remove line calls onRemoveLine with the line id, and is absent when readOnly', () => {
  const onRemoveLine = jest.fn();
  const editable = mount({ onRemoveLine });
  const button = [...editable.container.querySelectorAll('button')].find((b) => b.textContent === 'Remove line');
  act(() => Simulate.click(button));
  expect(onRemoveLine).toHaveBeenCalledWith(7);
  editable.unmount();

  const readOnly = mount({ onRemoveLine, readOnly: true });
  expect([...readOnly.container.querySelectorAll('button')].some((b) => b.textContent === 'Remove line')).toBe(false);
  readOnly.unmount();
});
