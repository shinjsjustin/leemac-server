import { NEW_JOB, NAV_GROUPS, visibleNav } from './adminNav';

const paths = (nav) => nav.groups.map((g) => [g.label, g.items.map((i) => i.path)]);

describe('adminNav', () => {
  it('lists the four rail groups with label, Korean label, path and minAccess', () => {
    expect(NEW_JOB).toEqual({ key: 'new-job', label: 'New job', ko: '', path: '/add-job', minAccess: 2 });
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
      ['Shop floor', ['/starred-jobs', '/joblist', '/partlist', '/shop-update', '/notelist']],
      ['Sales', ['/quote-requests', '/company']],
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

  it('keeps New job and Sales but no Money at level 2', () => {
    const nav = visibleNav(2);
    expect(nav.newJob).not.toBeNull();
    expect(nav.groups.map((g) => g.label)).toEqual(['Shop floor', 'Sales', 'System']);
  });
});
