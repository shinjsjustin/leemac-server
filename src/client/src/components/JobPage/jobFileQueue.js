import { createDrawingQueue } from '../ClientComponents/drawingQueue';
import { fetchAdminDrawingUrl } from '../../api/adminDrawing';

export const enqueueJobFile = createDrawingQueue({ fetchUrl: fetchAdminDrawingUrl }).enqueue;

export async function openJobPdf(file) {
  const fetched = await fetchAdminDrawingUrl(file);
  if (!fetched.ok) {
    alert('Failed to open file. Please try again.');
    return;
  }
  window.open(fetched.url, '_blank');
}
