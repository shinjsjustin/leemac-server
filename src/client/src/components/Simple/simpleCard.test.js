import {
  poLabel, invoiceLabel, money, formatDate, canMarkNoBid, pageNumbers, LOCKED_MESSAGE, readClaims, SESSION_MESSAGE, partFacts, statusText, STATUS_KO, jobFacts, noteTag, noteAuthor,
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

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const tokenFor = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;

test('readClaims returns the decoded claims for a valid token', () => {
  expect(readClaims(tokenFor({ id: 7, access: 2 }))).toEqual({ id: 7, access: 2 });
});

test('readClaims returns null for a missing or malformed token', () => {
  expect(readClaims(null)).toBeNull();
  expect(readClaims('')).toBeNull();
  expect(readClaims('not-a-token')).toBeNull();
});

test('SESSION_MESSAGE is a non-empty Korean message', () => {
  expect(SESSION_MESSAGE).toMatch(/[가-힣]/);
});

test('partFacts lists filled part fields in order with Korean labels', () => {
  const part = { details: ' Deburr ', material: 'AL6061', finish: '', stock_size: null, note: 'Rush' };
  expect(partFacts(part)).toEqual([
    { key: 'details', label: '상세', value: 'Deburr' },
    { key: 'material', label: '재질', value: 'AL6061' },
    { key: 'note', label: '비고', value: 'Rush' },
  ]);
  expect(partFacts({})).toEqual([]);
});

test('statusText gives the Korean status with flags, or null with no star', () => {
  expect(statusText({ star_status: 'running_machine_d', urgent: true, waiting: false })).toBe('가공 · 기계 D · 긴급');
  expect(statusText({ star_status: 'done', urgent: false, waiting: true })).toBe('완료 · 대기 중');
  expect(statusText({ star_status: 'new_kind' })).toBe('new_kind');
  expect(statusText({ star_status: null })).toBeNull();
});

test('STATUS_KO names every shop status', () => {
  const statuses = ['quoted', 'open', 'urgent', 'waiting', 'checking_stock', 'waiting_material', 'programming', 'setup',
    'running_machine_a', 'running_machine_d', 'running_manual', 'at_subvendor', 'waiting_finish', 'deburr_clean', 'qa',
    'packing', 'done', 'delivered', 'invoiced'];
  statuses.forEach((s) => expect(STATUS_KO[s]).toMatch(/[가-힣]/));
});

const adminPrivate = { author: 'Justin', is_client: 0, shared: 0 };
const adminShared = { author: 'Justin', is_client: 0, shared: 1 };
const clientNote = { author: 'Kim', is_client: 1, shared: 1 };

test('noteTag gives 공유 for shared notes and 비공개 for private ones', () => {
  expect(noteTag(adminPrivate)).toBe('비공개');
  expect(noteTag(adminShared)).toBe('공유');
  expect(noteTag(clientNote)).toBe('공유');
});

test('noteAuthor adds (고객) only for client notes', () => {
  expect(noteAuthor(adminPrivate)).toBe('Justin');
  expect(noteAuthor(adminShared)).toBe('Justin');
  expect(noteAuthor(clientNote)).toBe('Kim (고객)');
});

test('jobFacts lists set job dates as YYYY-MM-DD and the lead time as written', () => {
  const job = { po_date: null, due_date: '2026-12-01T08:00:00.000Z', leadtime: ' 3 weeks ', ship_date: '', paid_date: '2026-12-20' };
  expect(jobFacts(job)).toEqual([
    { key: 'due_date', label: '납기', value: '2026-12-01' },
    { key: 'leadtime', label: '리드타임', value: '3 weeks' },
    { key: 'paid_date', label: '입금일', value: '2026-12-20' },
  ]);
});
