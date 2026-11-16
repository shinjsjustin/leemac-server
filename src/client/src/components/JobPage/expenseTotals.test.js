import { jobNet } from './expenseTotals';

test.each([
  [109.13, 50.5, 58.63],
  ['109.13', 9.13, 100],
  [100, 150, -50],
  [null, 10, null],
  ['', 10, null],
  ['abc', 10, null],
  ['0.00', 10, null],
  [0, 10, null],
  [-5, 10, null],
])('jobNet(%p, %p) is %p', (total, expenses, expected) => {
  const net = jobNet(total, expenses);
  if (expected === null) expect(net).toBeNull();
  else expect(net).toBeCloseTo(expected, 2);
});
