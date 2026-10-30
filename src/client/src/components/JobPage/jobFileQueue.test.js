import { openJobPdf, enqueueJobFile } from './jobFileQueue';
import { fetchAdminDrawingUrl } from '../../api/adminDrawing';
import { renderPdfPagesToImages } from '../PdfImage';

jest.mock('../../api/adminDrawing', () => ({ fetchAdminDrawingUrl: jest.fn() }));
jest.mock('../PdfImage', () => ({ renderPdfPagesToImages: jest.fn() }));

const FILE = { id: 9, filename: 'a.pdf' };

beforeEach(() => {
  fetchAdminDrawingUrl.mockReset();
  renderPdfPagesToImages.mockReset();
  window.open = jest.fn();
  window.alert = jest.fn();
  URL.revokeObjectURL = jest.fn();
});

describe('openJobPdf', () => {
  it('opens the fetched blob URL in a new tab', async () => {
    fetchAdminDrawingUrl.mockResolvedValue({ ok: true, url: 'blob:abc' });
    await openJobPdf(FILE);
    expect(fetchAdminDrawingUrl).toHaveBeenCalledWith(FILE);
    expect(window.open).toHaveBeenCalledWith('blob:abc', '_blank');
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('alerts and opens nothing when the fetch fails', async () => {
    fetchAdminDrawingUrl.mockResolvedValue({ ok: false, error: { kind: 'error', message: 'x' } });
    await openJobPdf(FILE);
    expect(window.alert).toHaveBeenCalledWith('Failed to open file. Please try again.');
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe('enqueueJobFile', () => {
  it('renders the first page of a file fetched through the admin fetch', async () => {
    fetchAdminDrawingUrl.mockResolvedValue({ ok: true, url: 'blob:thumb' });
    renderPdfPagesToImages.mockResolvedValue(['data:img']);
    const result = await enqueueJobFile(FILE, 160).promise;
    expect(fetchAdminDrawingUrl).toHaveBeenCalledWith(FILE);
    expect(renderPdfPagesToImages).toHaveBeenCalledWith('blob:thumb', 160, true);
    expect(result).toEqual({ ok: true, src: 'data:img' });
  });
});
