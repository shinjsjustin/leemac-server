// Net is only meaningful once the job has a positive total; otherwise callers show a dash.
export const jobNet = (totalCost, expensesTotal) => {
  const total = Number(totalCost);
  return Number.isFinite(total) && total > 0 ? total - expensesTotal : null;
};
