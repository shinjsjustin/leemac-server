import React from 'react';

export const isBlank = (value) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

export default function PortalField({ label, value, children }) {
  if (isBlank(value)) return null;
  return (
    <div className="portal-field">
      <span className="portal-field-label">{label}</span>{' '}
      <span className="portal-field-value">{children ?? value}</span>
    </div>
  );
}
