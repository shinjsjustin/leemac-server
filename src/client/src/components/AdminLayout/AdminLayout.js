import React, { useEffect, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { apiFetch } from '../../api/apiFetch';
import AdminRail from './AdminRail';
import AdminTabBar from './AdminTabBar';
import { useIsPhone } from '../Overview/StageControl';
import CommandSearch from './CommandSearch';
import '../Styling/AdminLayout.css';

const AdminLayout = ({ current, crumb, actions, children }) => {
  const [badges, setBadges] = useState(null);
  const [isRailOpen, setIsRailOpen] = useState(false);
  const isPhone = useIsPhone();
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

  useEffect(() => {
    if (!isRailOpen) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsRailOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isRailOpen]);

  return (
    <div className="admin-shell">
      <AdminRail current={current} access={access} email={email} badges={badges} open={isRailOpen} />
      {isRailOpen && <div className="admin-scrim" onClick={() => setIsRailOpen(false)} />}
      <div className="admin-main">
        <header className="admin-top">
          {isPhone && (
            <button
              type="button"
              className="admin-menu"
              aria-label="Menu"
              aria-expanded={isRailOpen}
              onClick={() => setIsRailOpen((open) => !open)}
            >
              ☰
            </button>
          )}
          <div className="admin-crumb">{crumb}</div>
          <CommandSearch />
          {actions}
        </header>
        <main>{children}</main>
      </div>
      {isPhone && <AdminTabBar access={access} current={current} />}
    </div>
  );
};

export default AdminLayout;
