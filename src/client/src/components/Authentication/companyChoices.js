const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());

export function companyChoices(companies, filter) {
  const needle = filter.trim().toLowerCase();
  return [...companies]
    .sort(byName)
    .filter((c) => c.name.toLowerCase().includes(needle) || String(c.id).includes(needle))
    .map((c) => ({ id: c.id, label: `${c.name} (#${c.id})` }));
}
