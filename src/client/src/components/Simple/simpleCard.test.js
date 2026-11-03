import {
  poLabel, invoiceLabel, money, formatDate, canMarkNoBid, pageNumbers, LOCKED_MESSAGE,
} from './simpleCard';

test('poLabel shows the number or 발주 없음', () => {
  expect(poLabel({ po_number: ' 123 ' })).toBe('발주 123');
  expect(poLabel({ po_number: '   ' })).toBe('발주 없음');
  expect(poLabel({ po_number: null })).toBe('발주 없음');
});

test('invoiceLabel prefers paid, then invoice number, else not invoiced', () => {
  expect(invoiceLabel({ invoice_status: 'paid', invoice_number: 'A1' })).toBe('입금 완료');
  expect(invoiceLabel({ invoice_status: 'unpaid', invoice_number: 'A1' })).toBe('청구됨');
  expect(invoiceLabel({ invoice_status: null, invoice_number: ' ' })).toBe('청구 안 됨');
  expect(invoiceLabel({})).toBe('청구 안 됨');
});

test('money formats dollars with two decimals', () => {
  expect(money(1234.5)).toBe('$1,234.50');
  expect(money('0')).toBe('$0.00');
});

test('formatDate gives YYYY-MM-DD', () => {
  expect(formatDate('2026-11-02T13:45:00.000Z')).toBe('2026-11-02');
  expect(formatDate(null)).toBe('');
});

test('canMarkNoBid is true only at level 3 or more', () => {
  expect(canMarkNoBid(1)).toBe(false);
  expect(canMarkNoBid(2)).toBe(false);
  expect(canMarkNoBid(3)).toBe(true);
  expect(canMarkNoBid(4)).toBe(true);
  expect(canMarkNoBid(undefined)).toBe(false);
});

test('pageNumbers lists 1..pages', () => {
  expect(pageNumbers(2, 4)).toEqual([1, 2, 3, 4]);
  expect(pageNumbers(1, 1)).toEqual([1]);
  expect(pageNumbers(1, 0)).toEqual([]);
});

test('locked message is the Korean no-bid notice', () => {
  expect(LOCKED_MESSAGE).toBe('입찰 안 함은 저스틴만 누를 수 있습니다');
});
