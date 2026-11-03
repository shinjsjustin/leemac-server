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
};

export const LOCKED_MESSAGE = '입찰 안 함은 저스틴만 누를 수 있습니다';

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
