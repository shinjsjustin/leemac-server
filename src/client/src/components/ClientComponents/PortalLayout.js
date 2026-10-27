import React from 'react';
import Navbar from '../Navbar';
import logo from '../../Leemac-Logo.svg';
import '../Styling/ClientPortal.css';

const PortalLayout = ({ title, children }) => (
  <>
    <Navbar />
    <div className="portal">
      <header className="portal-header">
        <img className="portal-logo" src={logo} alt="Leemac" />
        <h1>{title}</h1>
      </header>
      {children}
    </div>
  </>
);

export default PortalLayout;
