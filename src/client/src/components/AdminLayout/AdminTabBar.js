import React from 'react';
import { Link } from 'react-router-dom';
import { visibleNav } from './adminNav';

const TAB_KEYS = ['overview', 'jobs', 'parts'];

export default function AdminTabBar({ access, current }) {
  const items = visibleNav(access).groups.flatMap((group) => group.items);
  const tabs = TAB_KEYS.map((key) => items.find((item) => item.key === key)).filter(Boolean);
  return (
    <nav className="admin-tabbar" aria-label="Tabs">
      {tabs.map((item) => (
        <Link key={item.key} to={item.path} aria-current={item.key === current ? 'page' : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
