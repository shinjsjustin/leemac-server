import { render } from '../../testUtils/render';
import AdminTabBar from './AdminTabBar';

global.IS_REACT_ACT_ENVIRONMENT = true;

const links = (container) => [...container.querySelectorAll('nav.admin-tabbar a')];

describe('AdminTabBar', () => {
  it('renders Overview, Jobs and Parts links at access 2', () => {
    const { container, unmount } = render(<AdminTabBar access={2} current="jobs" />);
    expect(links(container).map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Overview', '/starred-jobs'],
      ['Jobs', '/joblist'],
      ['Parts', '/partlist'],
    ]);
    expect(container.querySelector('nav').getAttribute('aria-label')).toBe('Tabs');
    unmount();
  });

  it('renders the three links at access 3', () => {
    const { container, unmount } = render(<AdminTabBar access={3} current="overview" />);
    expect(links(container).map((a) => a.textContent)).toEqual(['Overview', 'Jobs', 'Parts']);
    unmount();
  });

  it('renders only Overview at access 1', () => {
    const { container, unmount } = render(<AdminTabBar access={1} current="overview" />);
    expect(links(container).map((a) => a.textContent)).toEqual(['Overview']);
    unmount();
  });

  it('marks only the current link with aria-current page', () => {
    const { container, unmount } = render(<AdminTabBar access={2} current="parts" />);
    expect(links(container).map((a) => a.getAttribute('aria-current'))).toEqual([null, null, 'page']);
    unmount();
  });
});
