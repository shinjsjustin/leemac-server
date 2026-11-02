import React from 'react';
import '../Styling/PortalOverview.css';

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const clock = (at) => {
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function OverviewTicker({ entries }) {
  return (
    <div className="portal-ticker">
      <span className="portal-ticker-live">Live</span>
      {entries.length === 0 && <span className="portal-ticker-empty">No shop moves in the last 7 days</span>}
      {entries.map((entry, index) => (
        <span key={`${entry.at}-${entry.job_number}-${entry.part_number ?? ''}-${entry.stage.key}-${index}`} className="portal-ticker-item">
          <time className="portal-ticker-time">{clock(entry.at)}</time>
          <span className="portal-ticker-job">{entry.job_number}</span>
          {entry.own && <span className="portal-ticker-part">{entry.part_number}</span>}
          <span className="portal-ticker-stage">{entry.stage.label}</span>
        </span>
      ))}
    </div>
  );
}
