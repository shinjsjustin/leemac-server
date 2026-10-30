import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import PortalMessage from './PortalMessage';
import Logout from '../Authentication/Logout';
import logo from '../../Leemac-Logo.svg';
import '../Styling/ClientPortal.css';

const NAV = [
  { to: '/client-overview', label: 'Overview', tab: null, pattern: /^\/client-overview(\/|$)/ },
  { to: '/client-home', label: 'Your jobs', tab: 'Jobs', pattern: /^\/client-(home|job)(\/|$)/ },
  { to: '/client-parts', label: 'Parts', tab: 'Parts', pattern: /^\/client-parts?(\/|$)/ },
  { to: '/client-requests', label: 'Your requests', tab: 'Requests', pattern: /^\/client-requests?(\/|$)/ },
];
const ACCOUNT = { to: '/client-update-credentials', label: 'Account', tab: 'Account', pattern: /^\/client-update-credentials(\/|$)/ };

const FALLBACK_MARK = '?';

// Initials come from the JWT name claim; the token is only decoded for display, never trusted.
const initialsFromToken = () => {
  try {
    const payload = localStorage.getItem('token').split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const words = (JSON.parse(atob(payload)).name || '').trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('') || FALLBACK_MARK;
  } catch {
    return FALLBACK_MARK;
  }
};

// Keeps a crashing page from unmounting the whole app onto the dark body.
class PageErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error(error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <>
        <PortalMessage kind="error" />
        <button type="button" className="portal-button" onClick={() => window.location.reload()}>Reload</button>
      </>
    );
  }
}

const PortalLayout = ({ title, signedIn = true, back, titleAside, wide, hideTitle, children }) => {
  const { pathname } = useLocation();
  const link = (item, className, text) => (
    <Link
      key={item.to}
      className={className}
      to={item.to}
      aria-current={item.pattern.test(pathname) ? 'page' : undefined}
    >
      {text}
    </Link>
  );

  const h1 = <h1 className={hideTitle ? 'portal-visually-hidden' : undefined}>{title}</h1>;
  const heading = hideTitle && !titleAside ? h1 : (
    <div className="portal-title-row">
      {h1}
      {titleAside}
    </div>
  );

  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <Link to="/client-overview" className="portal-logo-link">
          <img className="portal-logo" src={logo} alt="Leemac" />
          <span className="portal-wordmark">Leemac</span>
        </Link>
        {signedIn && (
          <>
            <nav aria-label="Portal">
              {NAV.map((item) => link(item, 'portal-nav-link', item.label))}
            </nav>
            <div className="portal-nav-account">
              <Link
                className="portal-avatar"
                to={ACCOUNT.to}
                aria-label={ACCOUNT.label}
                aria-current={ACCOUNT.pattern.test(pathname) ? 'page' : undefined}
              >
                {initialsFromToken()}
              </Link>
              <Logout className="portal-nav-link" label="Log out" />
            </div>
          </>
        )}
      </header>
      <main className={wide ? 'portal portal--wide' : 'portal'}>
        {back}
        {heading}
        <PageErrorBoundary>{children}</PageErrorBoundary>
      </main>
      {signedIn && (
        <nav aria-label="Tabs" className="portal-tabbar">
          {[...NAV, ACCOUNT].filter((item) => item.tab).map((item) => link(item, undefined, item.tab))}
        </nav>
      )}
    </div>
  );
};

export default PortalLayout;
