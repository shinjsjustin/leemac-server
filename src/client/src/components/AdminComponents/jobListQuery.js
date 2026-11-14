const hasDates = ({ from, to }) => Boolean(from && to);

function filterParams(filter = {}) {
  if (filter.periodId) return `&periodId=${filter.periodId}`;
  if (hasDates(filter)) return `&from=${filter.from}&to=${filter.to}`;
  return '';
}

export function jobsQuery({ sortBy, order, limit, offset, attention, filter }) {
  return `/internal/job/getjobs?sortBy=${sortBy}&order=${order}&limit=${limit}&offset=${offset}&attention=${encodeURIComponent(attention)}${filterParams(filter)}`;
}

// Report filter and label for the ledger download, or null while the filter is incomplete.
export function ledgerFilter({ periodId, from, to, periods = [] }) {
  if (periodId) {
    const period = periods.find((p) => String(p.id) === String(periodId));
    return period ? { filter: { periodId }, label: period.lable } : null;
  }
  if (hasDates({ from, to })) return { filter: { from, to }, label: `${from} to ${to}` };
  return null;
}
