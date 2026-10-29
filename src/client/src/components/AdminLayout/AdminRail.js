import React from 'react';
import { Link } from 'react-router-dom';
import Logout from '../Authentication/Logout';
import logo from '../../Leemac-Logo.svg';
import { visibleNav } from './adminNav';

// Which /internal/badges field feeds which rail item; "hot" items need attention.
const BADGE_FIELDS = {
  overview: { field: 'active_parts' },
  'quote-requests': { field: 'new_requests', isHot: true },
  invoices: { field: 'waiting_invoices' },
};

const AdminRail = ({ current, access, email, badges }) => {
  const { newJob, groups } = visibleNav(access);

  const item = (nav, className) => {
    const badge = BADGE_FIELDS[nav.key];
    const count = badge && badges?.[badge.field];
    return (
      <Link
        key={nav.key}
        to={nav.path}
        className={className}
        aria-current={nav.key === current ? 'page' : undefined}
      >
        <span className="admin-label">{nav.label}</span>
        {nav.ko && <span className="admin-ko">{nav.ko}</span>}
        {count > 0 && <span className={`admin-badge${badge.isHot ? ' hot' : ''}`}>{count}</span>}
      </Link>
    );
  };

  return (
    <aside className="admin-rail">
      <div className="admin-brand">
        <img src={logo} alt="Leemac" />
        <div>Leemac<small>Shop admin</small></div>
      </div>
      <nav aria-label="Admin">
        {newJob && item(newJob, 'admin-newjob')}
        {groups.map((group) => (
          <div className="admin-grp" key={group.key}>
            <h6>{group.label}<span>{group.ko}</span></h6>
            {group.items.map((nav) => item(nav, 'admin-ra'))}
          </div>
        ))}
      </nav>
      <div className="admin-me">
        <div>
          <b>{email}</b>
          <small>Level {access}</small>
        </div>
        <Logout className="admin-out" label="Logout" />
      </div>
    </aside>
  );
};

export default AdminRail;
