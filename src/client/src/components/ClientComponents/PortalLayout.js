import React from 'react';
import { Link, useLocation } from 'react-router-dom';
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

const PortalLayout = ({ title, signedIn = true, back, titleAside, children }) => {
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

  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <Link to="/client-home" className="portal-logo-link">
          <img className="portal-logo" src={logo} alt="Leemac" />
        </Link>
        {signedIn && (
          <nav aria-label="Portal">
            {NAV.map((item) => link(item, 'portal-nav-link', item.label))}
            <div className="portal-nav-account">
              {link(ACCOUNT, 'portal-nav-link', ACCOUNT.label)}
              <Logout className="portal-nav-link" label="Log out" />
            </div>
          </nav>
        )}
      </header>
      <main className="portal">
        {back}
        <div className="portal-title-row">
          <h1>{title}</h1>
          {titleAside}
        </div>
        {children}
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
