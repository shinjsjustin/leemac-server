export const NEW_JOB = { key: 'new-job', label: 'New job', ko: '', path: '/add-job', minAccess: 2 };

export const NAV_GROUPS = [
  { key: 'shop-floor', label: 'Shop floor', ko: '작업장', items: [
    { key: 'overview', label: 'Overview', ko: '현황', path: '/starred-jobs', minAccess: 1 },
    { key: 'jobs', label: 'Jobs', ko: '일', path: '/joblist', minAccess: 2 },
    { key: 'parts', label: 'Parts', ko: '부품', path: '/partlist', minAccess: 2 },
    { key: 'shop-update', label: 'Shop update', ko: 'NFC', path: '/shop-update', minAccess: 1 },
    { key: 'notes', label: 'Notes', ko: '메모', path: '/notelist', minAccess: 1 },
  ] },
  { key: 'sales', label: 'Sales', ko: '영업', items: [
    { key: 'quote-requests', label: 'Quote requests', ko: '', path: '/quote-requests', minAccess: 2 },
    { key: 'clients', label: 'Clients', ko: '회사', path: '/company', minAccess: 2 },
  ] },
  { key: 'money', label: 'Money', ko: '돈', items: [
    { key: 'invoices', label: 'Invoices', ko: '청구서', path: '/finances#invoices', minAccess: 3 },
    { key: 'expenses', label: 'Expenses', ko: '', path: '/finances#expenses', minAccess: 3 },
    { key: 'finances', label: 'Finances', ko: '재무', path: '/finances', minAccess: 3 },
  ] },
  { key: 'system', label: 'System', ko: '', items: [
    { key: 'admins', label: 'Admins', ko: '', path: '/admins', minAccess: 3 },
    { key: 'settings', label: 'Settings', ko: '', path: '/settings', minAccess: 1 },
  ] },
];

export function visibleNav(access) {
  const allowed = (item) => access >= item.minAccess;
  return {
    newJob: allowed(NEW_JOB) ? NEW_JOB : null,
    groups: NAV_GROUPS
      .map((group) => ({ ...group, items: group.items.filter(allowed) }))
      .filter((group) => group.items.length > 0),
  };
}
