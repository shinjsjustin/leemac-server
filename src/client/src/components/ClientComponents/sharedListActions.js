export function addableParts(portalParts, list) {
  const listed = new Set(list.parts.map((part) => part.part_id));
  return portalParts.filter((part) => !listed.has(part.part_id));
}

export const removableParts = (list) => list.parts.filter((part) => part.can_remove);
