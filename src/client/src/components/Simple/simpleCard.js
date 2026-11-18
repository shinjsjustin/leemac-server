import { jwtDecode } from 'jwt-decode';

export const TERMS = {
  overview: '개요',
  quoted: '견적',
  notes: '메모',
  addNote: '메모 추가',
  noBid: '입찰 안 함',
  undo: '되돌리기',
  quantity: '수량',
  unitPrice: '단가',
  total: '합계',
  company: '회사',
  attention: '담당자',
  drawing: '도면',
  status: '상태',
};

/** The part fields shown under each part, in order, with their Korean labels. */
export const PART_FIELDS = [
  ['details', '상세'],
  ['material', '재질'],
  ['finish', '표면처리'],
  ['stock_size', '소재 크기'],
  ['note', '비고'],
];

/** The job dates and lead time shown in a card's header, in order, with their Korean labels. */
export const JOB_FIELDS = [
  ['po_date', '발주일'],
  ['due_date', '납기'],
  ['leadtime', '리드타임'],
  ['ship_date', '출하일'],
  ['invoice_date', '청구일'],
  ['paid_date', '입금일'],
];

/** The Korean name of each shop status a starred part can have. */
export const STATUS_KO = {
  quoted: '견적',
  open: '입고',
  urgent: '입고',
  waiting: '입고',
  checking_stock: '자재 · 재고 확인',
  waiting_material: '자재 · 자재 대기',
  programming: '준비 · 프로그래밍',
  setup: '준비 · 셋업',
  running_machine_a: '가공 · 기계 A',
  running_machine_d: '가공 · 기계 D',
  running_manual: '가공 · 수동',
  at_subvendor: '외주 · 외주처',
  waiting_finish: '외주 · 표면처리 대기',
  deburr_clean: '마무리 · 디버링 및 세척',
  qa: '검사',
  packing: '포장',
  done: '완료',
  delivered: '배송 완료',
  invoiced: '청구 완료',
};

/** A starred part's status in Korean with its urgent and waiting flags, or null for a part with no star. */
export function statusText(part) {
  if (!part.star_status) return null;
  const words = [STATUS_KO[part.star_status] ?? part.star_status];
  if (part.urgent) words.push('긴급');
  if (part.waiting) words.push('대기 중');
  return words.join(' · ');
}

/** The label and value of each job date that is set. */
export const jobFacts = (job) => JOB_FIELDS
  .filter(([key]) => job[key] != null && String(job[key]).trim() !== '')
  .map(([key, label]) => ({ key, label, value: key === 'leadtime' ? String(job[key]).trim() : formatDate(job[key]) }));

/** The label and value of each part field that has a value. */
export const partFacts = (part) => PART_FIELDS
  .filter(([key]) => filled(part[key]))
  .map(([key, label]) => ({ key, label, value: part[key].trim() }));

export const LOCKED_MESSAGE = '입찰 안 함은 저스틴만 누를 수 있습니다';

export const SESSION_MESSAGE = '로그인이 만료되었습니다. 다시 로그인해 주세요.';

const NO_BID_LEVEL = 3;

const filled = (value) => typeof value === 'string' && value.trim() !== '';

export const poLabel = (card) => (filled(card.po_number) ? `발주 ${card.po_number.trim()}` : '발주 없음');

export function invoiceLabel(card) {
  if (card.invoice_status === 'paid') return '입금 완료';
  return filled(card.invoice_number) ? '청구됨' : '청구 안 됨';
}

export const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (iso) => (iso ? String(iso).slice(0, 10) : '');

export const canMarkNoBid = (access) => access >= NO_BID_LEVEL;

export const pageNumbers = (page, pages) => Array.from({ length: pages }, (_, i) => i + 1);

export function readClaims(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}
