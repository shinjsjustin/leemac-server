import React from 'react';
import '../Styling/PortalTile.css';

const FLAG_TEXT = { due_soon: 'Due soon', overdue: 'Overdue' };

function FlagText({ flag }) {
  if (!FLAG_TEXT[flag]) return null;
  return <span className={`portal-stage-flag portal-stage-flag--${flag}`}>{FLAG_TEXT[flag]}</span>;
}

export function StageDot({ stage, flag }) {
  if (!stage) return null;
  return (
    <span className={`portal-job-dot portal-job-dot--${stage.key}`}>
      {stage.label}
      <FlagText flag={flag} />
    </span>
  );
}

export default function StageBadge({ stage, flag }) {
  if (!stage) return null;
  return (
    <span className={`portal-stage portal-stage--${stage.key}`}>
      {stage.label}
      <FlagText flag={flag} />
    </span>
  );
}
