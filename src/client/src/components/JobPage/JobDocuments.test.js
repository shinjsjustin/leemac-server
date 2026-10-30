import { act } from 'react';
import { render } from '../../testUtils/render';
import JobDocuments from './JobDocuments';
import { listDocuments, makeDocument } from '../../api/jobDocumentsApi';

jest.mock('../../api/jobDocumentsApi', () => ({ listDocuments: jest.fn(), makeDocument: jest.fn() }));
jest.mock('../../api/printApi', () => ({ printFile: jest.fn(), downloadFile: jest.fn() }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const LISTING = {
  quote: { id: 11, filename: 'Quote-1.pdf' },
  order: null,
  invoice: { id: 13, filename: 'Invoice-1.pdf' },
  packing: { id: 14, filename: 'Packing-1.pdf' },
  shipping: { id: 15, filename: 'Label-1.pdf' },
};

const rows = (c) => [...c.querySelectorAll('li')];
const makeButtons = (c) => [...c.querySelectorAll('button')].filter((b) => b.textContent.startsWith('Mak'));

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
