/** Notes pinned to one part, oldest first. */
export function partNotesFor(data, partId) {
  const notes = data?.parts?.[partId] ?? [];
  return [...notes].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);
}
