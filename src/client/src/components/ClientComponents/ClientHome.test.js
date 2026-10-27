import React, { act } from 'react';
import { render } from '../../testUtils/render';
import ClientHome from './ClientHome';

jest.mock('./PortalDrawing', () => ({
  __esModule: true,
  default: ({ file }) => <div className="drawing-stub">{file.filename}</div>,
  NoDrawing: () => <div className="portal-drawing-empty">No drawing</div>,
}));

global.IS_REACT_ACT_ENVIRONMENT = true;

const job = (id, over = {}) => ({
  id,
  job_number: `J-${id}`,
  status: 'open',
  po_number: `PO-${id}`,
  po_date: '2024-01-02',
  due_date: '2024-03-05T00:00:00.000Z',
  ship_date: null,
  parts: [{ job_part_id: 1 }],
  ...over,
});

const page = (jobs, hasMore = false) => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  json: async () => ({ jobs, pagination: { total: jobs.length, limit: 20, offset: 0, hasMore } }),
});
const failure = (status) => ({ ok: false, status, headers: { get: () => null }, json: async () => ({}) });

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

let view;
const mount = async () => {
  view = render(<ClientHome />);
  await flush();
  return view.container;
};

beforeEach(() => { global.fetch = jest.fn(); });
afterEach(() => view && view.unmount());

describe('ClientHome', () => {
  it('shows number, badge, PO, dates and part count for each job', async () => {
    global.fetch.mockResolvedValueOnce(page([
      job(1, { parts: [{}, {}] }),
      job(2, { status: 'shipped', ship_date: '2024-04-09T00:00:00.000Z', parts: [{}] }),
    ]));
    const c = await mount();
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/portal\/jobs\?limit=20&offset=0$/);
    const cards = c.querySelectorAll('.portal-card');
    expect(cards).toHaveLength(2);
    const [a, b] = [...cards].map((x) => x.textContent);
    expect(a).toContain('J-1');
    expect(a).toContain('Open');
    expect(a).toContain('PO-1');
    expect(a).toContain('3/5/2024');
    expect(a).toContain('2 parts');
    expect(cards[0].querySelector('.portal-badge--shipped')).toBeNull();
    expect(a).not.toContain('Shipped');
    expect(b).toContain('Shipped');
    expect(b).toContain('4/9/2024');
    expect(b).toContain('1 part');
    expect(b).not.toContain('1 parts');
    expect(cards[1].querySelector('.portal-badge--shipped').textContent).toBe('Shipped');
  });

  it('omits PO, Due and Ship labels and dashes when those values are null', async () => {
    global.fetch.mockResolvedValueOnce(page([job(1, { po_number: null, due_date: null, ship_date: null })]));
    const c = await mount();
    const card = c.querySelector('.portal-card');
    expect(card.querySelectorAll('.portal-field')).toHaveLength(0);
    expect(card.textContent).not.toMatch(/PO|Due|Ship/);
    expect(card.textContent).not.toContain('—');
    expect(card.textContent).toContain('J-1');
  });

  it('renders PO, Due and Ship as labelled portal-field rows', async () => {
    global.fetch.mockResolvedValueOnce(page([job(2, { ship_date: '2024-04-09T00:00:00.000Z' })]));
    const c = await mount();
    const rows = [...c.querySelectorAll('.portal-card .portal-field')].map((x) => [
      x.querySelector('.portal-field-label').textContent,
      x.querySelector('.portal-field-value').textContent,
    ]);
    expect(rows).toEqual([['PO', 'PO-2'], ['Due', '3/5/2024'], ['Ship', '4/9/2024']]);
  });

  it('makes each card a div holding a job link with aria-label and a closed Show parts button', async () => {
    global.fetch.mockResolvedValueOnce(page([job(1), job(2, { status: 'shipped' })]));
    const c = await mount();
    const cards = [...c.querySelectorAll('.portal-job-card')];
    expect(cards.map((x) => x.tagName)).toEqual(['DIV', 'DIV']);
    const links = cards.map((x) => x.querySelector('a.portal-job-link'));
    expect(links.map((x) => x.getAttribute('aria-label'))).toEqual(['Job J-1, Open', 'Job J-2, Shipped']);
    cards.forEach((card) => {
      const toggle = card.querySelector('button.portal-parts-toggle');
      expect(toggle.textContent).toBe('Show parts');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(card.querySelector('a button')).toBeNull();
    });
  });

  it('links each card to /client-job/:id', async () => {
    global.fetch.mockResolvedValueOnce(page([job(7), job(9)]));
    const c = await mount();
    const hrefs = [...c.querySelectorAll('.portal-job-link')].map((x) => x.getAttribute('href'));
    expect(hrefs).toEqual(['/client-job/7', '/client-job/9']);
  });

  describe('parts drop-down', () => {
    const files = (...names) => names.map((filename, i) => ({ id: i + 1, filename, mimetype: 'application/pdf' }));
    const filesResponse = (list) => ({
      ok: true, status: 200, headers: { get: () => null }, json: async () => list,
    });
    const parts = [
      { job_part_id: 1, part_id: 11, part_number: 'P-11', part_description: 'Bracket' },
      { job_part_id: 2, part_id: 11, part_number: 'P-11', part_description: 'Bracket' },
      { job_part_id: 3, part_id: 12, part_number: 'P-12', part_description: '  ' },
    ];
    const urls = () => global.fetch.mock.calls.map((x) => x[0]);
    const toggleOf = (c, i) => c.querySelectorAll('button.portal-parts-toggle')[i];
    const click = async (el) => { await act(async () => { el.click(); }); await flush(); };

    it('fetches only jobs until a card opens', async () => {
      global.fetch.mockResolvedValueOnce(page([job(1, { parts })]));
      await mount();
      expect(urls()).toHaveLength(1);
      expect(urls()[0]).toMatch(/\/portal\/jobs\?/);
    });

    it('opens one card, fetches each distinct part once, leaves others closed, and does not refetch', async () => {
      global.fetch.mockResolvedValueOnce(page([job(1, { parts }), job(2, { parts: [{ part_id: 99, part_number: 'X' }] })]));
      global.fetch.mockResolvedValueOnce(filesResponse(files('a.pdf')));
      global.fetch.mockResolvedValueOnce(filesResponse([]));
      const c = await mount();
      await click(toggleOf(c, 0));
      expect(urls().slice(1).sort()).toEqual([
        expect.stringMatching(/\/portal\/parts\/11\/files$/),
        expect.stringMatching(/\/portal\/parts\/12\/files$/),
      ]);
      expect(toggleOf(c, 0).textContent).toBe('Hide parts');
      const list = c.querySelector('ul.portal-job-parts');
      expect(list.id).toBe(toggleOf(c, 0).getAttribute('aria-controls'));
      expect(c.querySelectorAll('ul.portal-job-parts')).toHaveLength(1);
      expect(toggleOf(c, 1).getAttribute('aria-expanded')).toBe('false');
      await click(toggleOf(c, 0));
      expect(c.querySelector('ul.portal-job-parts')).toBeNull();
      await click(toggleOf(c, 0));
      expect(urls()).toHaveLength(3);
      expect(c.querySelector('ul.portal-job-parts')).not.toBeNull();
    });

    it('renders a drawing per PDF, No drawing without PDFs, and hides blank descriptions', async () => {
      global.fetch.mockResolvedValueOnce(page([job(1, { parts })]));
      global.fetch.mockImplementation((url) => Promise.resolve(
        filesResponse(/\/11\/files/.test(url)
          ? [...files('a.pdf', 'b.pdf'), { id: 9, filename: 'm.step', mimetype: '' }]
          : [{ id: 8, filename: 'm.step', mimetype: '' }]),
      ));
      const c = await mount();
      await click(toggleOf(c, 0));
      const items = c.querySelectorAll('ul.portal-job-parts > li');
      expect(items).toHaveLength(3);
      expect([...items[0].querySelectorAll('.drawing-stub')].map((x) => x.textContent)).toEqual(['a.pdf', 'b.pdf']);
      expect(items[0].querySelector('.portal-drawings')).not.toBeNull();
      expect(items[0].textContent).toContain('P-11');
      expect(items[0].textContent).toContain('Bracket');
      expect(items[2].textContent).toContain('P-12');
      expect(items[2].querySelectorAll('.drawing-stub')).toHaveLength(0);
      expect(items[2].textContent).toContain('No drawing');
    });

    it('shows the portal message when the file list fails', async () => {
      global.fetch.mockResolvedValueOnce(page([job(1, { parts: [parts[0]] })]));
      global.fetch.mockResolvedValueOnce(failure(429));
      const c = await mount();
      await click(toggleOf(c, 0));
      expect(c.querySelector('.portal-message').textContent).toContain('We are a little busy');
    });

    it('shows loading while the file lists are pending', async () => {
      global.fetch.mockResolvedValueOnce(page([job(1, { parts: [parts[0]] })]));
      global.fetch.mockReturnValueOnce(new Promise(() => {}));
      const c = await mount();
      await click(toggleOf(c, 0));
      expect(c.querySelector('.portal-message').textContent).toContain('Loading');
    });
  });

  it('has no Show parts button for a job without parts', async () => {
    global.fetch.mockResolvedValueOnce(page([job(1, { parts: [] })]));
    const c = await mount();
    expect(c.querySelector('.portal-parts-toggle')).toBeNull();
    expect(c.textContent).toContain('0 parts');
  });

  it('Load more requests the next offset, appends jobs and hides when done', async () => {
    global.fetch
      .mockResolvedValueOnce(page([job(1)], true))
      .mockResolvedValueOnce(page([job(2)], false));
    const c = await mount();
    const button = () => [...c.querySelectorAll('button.portal-button')].find((b) => b.textContent === 'Load more');
    expect(button()).toBeDefined();
    await act(async () => { button().click(); });
    await flush();
    expect(global.fetch.mock.calls[1][0]).toMatch(/limit=20&offset=20$/);
    expect(c.querySelectorAll('.portal-card')).toHaveLength(2);
    expect(button()).toBeUndefined();
  });

  it('hides Load more when hasMore is false', async () => {
    global.fetch.mockResolvedValueOnce(page([job(1)], false));
    const c = await mount();
    expect(c.textContent).not.toContain('Load more');
  });

  it('shows the empty state for zero jobs', async () => {
    global.fetch.mockResolvedValueOnce(page([]));
    const c = await mount();
    const messages = c.querySelectorAll('.portal-message');
    expect(messages).toHaveLength(1);
    expect(messages[0].textContent).toContain("You don't have any jobs with us yet.");
    expect(c.querySelectorAll('.portal-card')).toHaveLength(0);
  });

  it('shows the signed_out message on 401', async () => {
    global.fetch.mockResolvedValueOnce(failure(401));
    const c = await mount();
    expect(c.textContent).toContain('You are signed out');
  });

  it('shows the busy message on 429', async () => {
    global.fetch.mockResolvedValueOnce(failure(429));
    const c = await mount();
    expect(c.textContent).toContain('We are a little busy');
  });

  it('shows a loading message before the first page arrives', async () => {
    global.fetch.mockReturnValueOnce(new Promise(() => {}));
    const c = await mount();
    expect(c.textContent).toContain('Loading');
  });
});
