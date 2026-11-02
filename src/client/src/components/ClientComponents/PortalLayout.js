import React, { useEffect, useState } from 'react';
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

const PortalLayout = ({ title, signedIn = true, back, titleAside, wide, hideTitle, activePath, children }) => {
  const { pathname } = useLocation();
  const currentPath = activePath ?? pathname;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const initials = initialsFromToken();

  useEffect(() => {
    if (!isMenuOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setIsMenuOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isMenuOpen]);

  const link = (item, className, text, ariaLabel) => (
    <Link
      key={item.to}
      className={className}
      to={item.to}
      aria-label={ariaLabel}
      aria-current={item.pattern.test(currentPath) ? 'page' : undefined}
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
              <button
                type="button"
                className="portal-avatar"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
              >
                {initials}
              </button>
              {isMenuOpen && (
                <div className="portal-account-menu" role="menu" onClick={() => setIsMenuOpen(false)}>
                  <Link role="menuitem" className="portal-nav-link" to={ACCOUNT.to}>Account</Link>
                  <Logout className="portal-nav-link" label="Log out" />
                </div>
              )}
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
          {[...NAV, ACCOUNT].filter((item) => item.tab).map((item) => (
            item === ACCOUNT ? link(item, undefined, initials, ACCOUNT.label) : link(item, undefined, item.tab)
          ))}
        </nav>
      )}
    </div>
  );
};

export default PortalLayout;
