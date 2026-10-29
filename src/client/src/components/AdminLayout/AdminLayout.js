import React, { useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { apiFetch } from '../../api/apiFetch';
import AdminRail from './AdminRail';
import CommandSearch from './CommandSearch';
import '../Styling/AdminLayout.css';

const AdminLayout = ({ current, crumb, actions, children }) => {
  const [badges, setBadges] = useState(null);
  const token = localStorage.getItem('token');
  const { email, access = 0 } = token ? jwtDecode(token) : {};

  useEffect(() => {
    let isCurrent = true;
    apiFetch('/internal/badges')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (isCurrent) setBadges(data); })
      .catch(() => {}); // badges are decoration; the page works without them
    return () => { isCurrent = false; };
  }, []);

  return (
    <div className="admin-shell">
      <AdminRail current={current} access={access} email={email} badges={badges} />
      <div className="admin-main">
        <header className="admin-top">
          <div className="admin-crumb">{crumb}</div>
          <CommandSearch />
          {actions}
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
};

export default AdminLayout;
