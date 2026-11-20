import { visibilityLabel } from '../noteLabels';

const PART_ONLY = 'Part only';

export function messageMeta(note) {
  return {
    job: note.job_number ?? PART_ONLY,
    author: note.is_client ? `${note.author} (client)` : note.author,
    visibility: visibilityLabel(note),
  };
}
