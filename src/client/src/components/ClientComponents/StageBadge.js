import React from 'react';
import '../Styling/PortalTile.css';

const FLAG_TEXT = { due_soon: 'Due soon', overdue: 'Overdue' };

export default function StageBadge({ stage, flag }) {
  if (!stage) return null;
  return (
    <span className={`portal-stage portal-stage--${stage.key}`}>
      {stage.label}
      {FLAG_TEXT[flag] && (
        <span className={`portal-stage-flag portal-stage-flag--${flag}`}>{FLAG_TEXT[flag]}</span>
      )}
    </span>
  );
}
