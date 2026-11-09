import { NEW_JOB, NAV_GROUPS, visibleNav } from './adminNav';

const paths = (nav) => nav.groups.map((g) => [g.label, g.items.map((i) => i.path)]);

describe('adminNav', () => {
  it('lists the four rail groups with label, Korean label, path and minAccess', () => {
    expect(NEW_JOB).toEqual({ key: 'new-job', label: 'New job', ko: '', path: '/add-job', minAccess: 3 });
    expect(NAV_GROUPS.map((g) => [g.label, g.ko])).toEqual([
      ['Shop floor', '작업장'],
      ['Sales', '영업'],
      ['Money', '돈'],
      ['System', ''],
    ]);
    const finances = NAV_GROUPS[2].items.find((i) => i.key === 'finances');
    expect(finances).toEqual({ key: 'finances', label: 'Finances', ko: '재무', path: '/finances', minAccess: 3 });
    expect(NAV_GROUPS[0].items.find((i) => i.key === 'shop-update').minAccess).toBe(1);
  });

  it('shows everything to a level-3 admin', () => {
    const nav = visibleNav(3);
    expect(nav.newJob.path).toBe('/add-job');
    expect(paths(nav)).toEqual([
      ['Shop floor', ['/starred-jobs', '/qc-requests', '/joblist', '/partlist', '/shop-update', '/notelist']],
      ['Sales', ['/quoted', '/quote-requests', '/company']],
      ['Money', ['/finances#invoices', '/finances#expenses', '/finances']],
      ['System', ['/admins', '/printers', '/settings']],
    ]);
  });

  it('hides Money, Admins and New job from a level-1 admin', () => {
    const nav = visibleNav(1);
    expect(nav.newJob).toBeNull();
    expect(paths(nav)).toEqual([
      ['Shop floor', ['/starred-jobs', '/shop-update', '/notelist']],
      ['System', ['/printers', '/settings']],
    ]);
  });

  it('shows level 2 개요 and 견적 but no New job', () => {
    const nav = visibleNav(2);
    expect(nav.newJob).toBeNull();
    expect(nav.groups.map((g) => g.label)).toEqual(['Shop floor', 'Sales', 'System']);
    expect(nav.groups[0].items.map((i) => [i.label, i.path])[0]).toEqual(['개요', '/simple-overview']);
    expect(nav.groups[1].items.map((i) => [i.label, i.path])[0]).toEqual(['견적', '/quoted']);
  });

  it('hides 개요 from level 3 but keeps 견적', () => {
    const nav = visibleNav(3);
    expect(nav.groups[0].items.map((i) => i.path)).not.toContain('/simple-overview');
    expect(nav.groups[1].items.map((i) => i.path)).toContain('/quoted');
  });

  it('lists QC requests (검사) at /qc-requests from access 2, right after Overview', () => {
    const items = NAV_GROUPS[0].items;
    const index = items.findIndex((i) => i.key === 'overview');
    expect(items[index + 1]).toEqual({ key: 'qc-requests', label: 'QC requests', ko: '검사', path: '/qc-requests', minAccess: 2 });
    expect(visibleNav(2).groups[0].items.map((i) => i.path)).toContain('/qc-requests');
    expect(visibleNav(1).groups[0].items.map((i) => i.path)).not.toContain('/qc-requests');
  });
});
