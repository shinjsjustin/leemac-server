import React from 'react';
import { Link } from 'react-router-dom';
import Logout from '../Authentication/Logout';
import logo from '../../Leemac-Logo.svg';
import '../Styling/ClientPortal.css';

const PortalLayout = ({ title, signedIn = true, back, titleAside, children }) => (
  <div className="portal-shell">
    <header className="portal-topbar">
      <Link to="/client-home" className="portal-logo-link">
        <img className="portal-logo" src={logo} alt="Leemac" />
      </Link>
      {signedIn && (
        <nav aria-label="Portal">
          <Link className="portal-nav-link" to="/client-home">Your jobs</Link>
          <Link className="portal-nav-link" to="/client-requests">Your requests</Link>
          <Link className="portal-nav-link" to="/client-update-credentials">Account</Link>
          <Logout className="portal-nav-link" label="Log out" />
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
  </div>
);

export default PortalLayout;
