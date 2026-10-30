import { act } from 'react';
import { render } from '../../testUtils/render';
import JobDocuments from './JobDocuments';
import { openJobPdf } from './jobFileQueue';
import { listDocuments, makeDocument, getDocumentForm, saveDocument } from '../../api/jobDocumentsApi';

jest.mock('../../api/jobDocumentsApi', () => ({
  listDocuments: jest.fn(), makeDocument: jest.fn(), getDocumentForm: jest.fn(), saveDocument: jest.fn(),
  refillDocument: jest.fn(),
}));
jest.mock('../../api/apiFetch', () => ({ apiFetch: jest.fn() }));
jest.mock('../../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));

jest.mock('./jobFileQueue', () => ({ enqueueJobFile: jest.fn(), openJobPdf: jest.fn() }));
jest.mock('../ClientComponents/DrawingTile', () => ({ __esModule: true, default: ({ file, onOpen }) => (
  <button type="button" data-testid="tile" data-file-id={file.id} onClick={() => onOpen(file)}>tile</button>
) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LISTING = {
  quote: { id: 11, filename: 'Quote-1.pdf' },
  order: null,
  invoice: { id: 13, filename: 'Invoice-1.pdf' },
  packing: { id: 14, filename: 'Packing-1.pdf' },
  shipping: { id: 15, filename: 'Label-1.pdf' },
};

const rows = (c) => [...c.querySelectorAll('.jc-card, .jc-placeholder')];
const makeButtons = (c) => [...c.querySelectorAll('button')].filter((b) => b.textContent.startsWith('Mak'));
const tiles = (c) => [...c.querySelectorAll('[data-testid="tile"]')];

async function setup(accessLevel, onMade = jest.fn()) {
  let view;
  await act(async () => {
    view = render(<JobDocuments jobId={7} accessLevel={accessLevel} onMade={onMade} />);
  });
  return { c: view.container, onMade };
}

beforeEach(() => {
  jest.clearAllMocks();
  listDocuments.mockResolvedValue({ ok: true, data: LISTING });
});

test('lists the five documents in order and shows filenames only for saved ones', async () => {
  const { c } = await setup(1);
  expect(listDocuments).toHaveBeenCalledWith(7);
  const text = rows(c).map((r) => r.textContent);
  expect(text).toHaveLength(5);
  ['Quote', 'Order', 'Invoice', 'Packing list', 'Shipping label'].forEach((label, i) => {
    expect(text[i]).toContain(label);
  });
  expect(text[0]).toContain('Quote-1.pdf');
  expect(text[1]).not.toContain('.pdf');
  expect(c.querySelectorAll('.jc-grid')).toHaveLength(1);
  expect(text[3]).toContain('Packing-1.pdf');
});

test('rows with a file get print actions; rows without do not', async () => {
  const { c } = await setup(1);
  const counts = rows(c).map((r) => [...r.querySelectorAll('button')].filter((b) => b.textContent === 'Print').length);
  expect(counts).toEqual([1, 0, 1, 1, 1]);
});

test('print sends the file id with the document kind', async () => {
  const { printFile } = require('../../api/printApi');
  printFile.mockResolvedValue({ ok: true, data: { printer: 'P', copies: 1 } });
  const { c } = await setup(1);
  const printOf = (i) => [...rows(c)[i].querySelectorAll('button')].find((b) => b.textContent === 'Print');
  await act(async () => printOf(3).click());
  expect(printFile).toHaveBeenCalledWith(14, 'packing');
  await act(async () => printOf(4).click());
  expect(printFile).toHaveBeenCalledWith(15, 'shipping');
});

test('Make PDF is absent below level 3', async () => {
  const { c } = await setup(2);
  expect(makeButtons(c)).toHaveLength(0);
});

test('Make PDF disables while pending, then reloads and calls onMade', async () => {
  let finish;
  makeDocument.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { c, onMade } = await setup(3);
  expect(makeButtons(c)).toHaveLength(5);
  await act(async () => makeButtons(c)[2].click());
  expect(makeDocument).toHaveBeenCalledWith(7, 'invoice');
  expect(makeButtons(c)[2].textContent).toBe('Making…');
  expect(makeButtons(c)[2].disabled).toBe(true);
  await act(async () => makeButtons(c)[2].click());
  expect(makeDocument).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ok: true, data: {} }));
  expect(listDocuments).toHaveBeenCalledTimes(2);
  expect(onMade).toHaveBeenCalledTimes(1);
  expect(makeButtons(c)[2].disabled).toBe(false);
});

test('Make PDF shows the server error and does not call onMade', async () => {
  makeDocument.mockResolvedValue({ ok: false, error: { message: 'PDF renderer is not installed' } });
  const { c, onMade } = await setup(3);
  await act(async () => makeButtons(c)[0].click());
  const statuses = [...rows(c)[0].querySelectorAll('span[role="status"]')].map((s) => s.textContent);
  expect(statuses).toContain('PDF renderer is not installed');
  expect(onMade).not.toHaveBeenCalled();
  expect(listDocuments).toHaveBeenCalledTimes(1);
});

const editButtons = (c) => [...c.querySelectorAll('button')].filter((b) => b.textContent === 'Edit');
const FORM = {
  type: 'invoice', saved: false, savedAt: null, savedBy: null, fileId: null,
  fields: {
    customer: { name: 'Acme', line1: '', line2: '', attention: '' },
    reference: '1042AC',
    dates: { created: '', po: '', due: '', invoice: '', ship: '' },
    poNumber: '', invoiceNumber: '', tax: { flag: 'N', percent: 0, amount: 0 },
  },
  parts: [],
};

test('Edit is absent below level 3 and sits on every card at level 3', async () => {
  const low = await setup(2);
  expect(editButtons(low.c)).toHaveLength(0);
  const high = await setup(3);
  expect(editButtons(high.c)).toHaveLength(5);
});

test('Edit opens the editor for that document and Cancel closes it', async () => {
  getDocumentForm.mockResolvedValue({ ok: true, data: FORM });
  const { c } = await setup(3);
  await act(async () => editButtons(c)[2].click());
  expect(getDocumentForm).toHaveBeenCalledWith(7, 'invoice');
  expect(c.querySelector('.jh-modal h3').textContent).toBe('Edit Invoice');
  await act(async () => [...c.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click());
  expect(c.querySelector('.jh-modal')).toBeNull();
});

test('a save closes the editor, reloads the list and calls onMade', async () => {
  getDocumentForm.mockResolvedValue({ ok: true, data: FORM });
  saveDocument.mockResolvedValue({ ok: true, data: {} });
  const { c, onMade } = await setup(3);
  await act(async () => editButtons(c)[2].click());
  await act(async () => [...c.querySelectorAll('button')].find((b) => b.textContent === 'Save').click());
  expect(saveDocument).toHaveBeenCalledWith(7, 'invoice', { fields: FORM.fields, parts: [] });
  expect(listDocuments).toHaveBeenCalledTimes(2);
  expect(onMade).toHaveBeenCalledTimes(1);
  expect(c.querySelector('.jh-modal')).toBeNull();
});

test('a failed listing shows its message in a status line', async () => {
  listDocuments.mockResolvedValue({ ok: false, error: { message: 'Could not load documents' } });
  const { c } = await setup(1);
  const statuses = [...c.querySelectorAll('[role="status"]')].map((s) => s.textContent);
  expect(statuses).toEqual(['Could not load documents']);
});

test('documents with a PDF get a card with a tile keyed by file id; others get a placeholder', async () => {
  const { c } = await setup(1);
  expect(c.querySelectorAll('.jc-card')).toHaveLength(4);
  expect(tiles(c).map((t) => t.dataset.fileId)).toEqual(['11', '13', '14', '15']);
  const placeholder = c.querySelector('.jc-placeholder');
  expect(placeholder.textContent).toBe('Order');
  expect(placeholder.querySelector('button')).toBeNull();
});

test('at level 3 the placeholder offers Edit and Make PDF inside an actions row; cards offer Edit, Make PDF, Download and Print', async () => {
  const { c } = await setup(3);
  const labels = (el) => [...el.querySelectorAll('button')].map((b) => b.textContent);
  expect(labels(c.querySelector('.jc-placeholder'))).toEqual(['Edit', 'Make PDF']);
  expect(c.querySelectorAll('.jc-placeholder .jc-actions')).toHaveLength(1);
  expect(labels(rows(c)[0]).sort()).toEqual(['Download PDF', 'Edit', 'Make PDF', 'Print', 'tile']);
});

test('clicking a thumbnail opens that file', async () => {
  const { c } = await setup(1);
  await act(async () => tiles(c)[1].click());
  expect(openJobPdf).toHaveBeenCalledWith({ id: 13, filename: 'Invoice-1.pdf' });
});

test('after Make PDF the tile receives the new file id', async () => {
  makeDocument.mockResolvedValue({ ok: true, data: {} });
  listDocuments.mockResolvedValueOnce({ ok: true, data: LISTING })
    .mockResolvedValueOnce({ ok: true, data: { ...LISTING, invoice: { id: 99, filename: 'Invoice-2.pdf' } } });
  const { c } = await setup(3);
  await act(async () => makeButtons(c)[2].click());
  expect(tiles(c).map((t) => t.dataset.fileId)).toEqual(['11', '99', '14', '15']);
});

test('at level 3 the Order placeholder Edit opens the editor for order', async () => {
  getDocumentForm.mockResolvedValue({ ok: true, data: { ...FORM, type: 'order' } });
  const { c } = await setup(3);
  const edit = [...c.querySelector('.jc-placeholder').querySelectorAll('button')].find((b) => b.textContent === 'Edit');
  await act(async () => edit.click());
  expect(getDocumentForm).toHaveBeenCalledWith(7, 'order');
  expect(c.querySelector('.jh-modal h3').textContent).toBe('Edit Order');
});

test('at level 2 the Order placeholder shows neither Edit nor Make PDF', async () => {
  const { c } = await setup(2);
  const placeholder = c.querySelector('.jc-placeholder');
  expect(placeholder.textContent).toBe('Order');
  expect(placeholder.querySelector('button')).toBeNull();
});

test('a failed listing renders its message in a jc-error span', async () => {
  listDocuments.mockResolvedValue({ ok: false, error: { message: 'Could not load documents' } });
  const { c } = await setup(1);
  const span = c.querySelector('span.jc-error[role="status"]');
  expect(span.textContent).toBe('Could not load documents');
});

test('a failed Make PDF renders its message in a jc-error span', async () => {
  makeDocument.mockResolvedValue({ ok: false, error: { message: 'PDF renderer is not installed' } });
  const { c } = await setup(3);
  await act(async () => makeButtons(c)[0].click());
  const span = rows(c)[0].querySelector('span.jc-error[role="status"]');
  expect(span.textContent).toBe('PDF renderer is not installed');
});

test('PrintActions status inside a Documents card has no jc-error class', async () => {
  const { printFile } = require('../../api/printApi');
  printFile.mockResolvedValue({ ok: true, data: { printer: 'P', copies: 1 } });
  const { c } = await setup(1);
  const print = [...rows(c)[0].querySelectorAll('button')].find((b) => b.textContent === 'Print');
  await act(async () => print.click());
  const status = rows(c)[0].querySelector('span[role="status"]');
  expect(status).not.toBeNull();
  expect(status.classList.contains('jc-error')).toBe(false);
});
