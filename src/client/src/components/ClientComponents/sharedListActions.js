import { downloadFile } from '../../api/portalApi';

export function addableParts(portalParts, list) {
  const listed = new Set(list.parts.map((part) => part.part_id));
  return portalParts.filter((part) => !listed.has(part.part_id));
}

export const removableParts = (list) => list.parts.filter((part) => part.can_remove);

export async function downloadListFile(file) {
  const result = await downloadFile(file);
  return result.ok ? '' : result.error.message;
}
