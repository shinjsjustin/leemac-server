// The share reply keeps only Leemac's markings and drops the flag, so restore it here.
// It names no files either, so drawings are labelled by their order.
export function qcView({ part, markings, photos }) {
  const fileIds = [...new Set(markings.map((m) => m.file_id))];
  return {
    number: part.number,
    description: part.description,
    markings: markings.map((m) => ({ ...m, is_leemac: true, mine: false })),
    drawings: fileIds.map((id, index) => ({ id, filename: `Drawing ${index + 1}` })),
    photos: [{ job_id: 'shared', photos }],
  };
}
