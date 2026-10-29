import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import JobRow from './JobRow';
import DrawingTile from './DrawingTile';
import OverviewSchedule from './OverviewSchedule';
import OverviewTicker from './OverviewTicker';
import OverviewRail from './OverviewRail';
import { getOverview, getSchedule, getTicker, formatDate, statusLabel } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import { createList } from '../../api/portalListsApi';
import '../Styling/PortalOverview.css';

const PHONE_QUERY = '(max-width: 599px)';
const PART_TILE_WIDTH_PX = 240;
const PART_TILE_ASPECT = 1.4;
const HEADLINE = [
  ['active_jobs', 'Active jobs'],
  ['due_soon', 'Due soon'],
  ['overdue', 'Overdue'],
];
const REFRESH_MS = 60000;
const NO_RATE_DASH = '\u2014';

const isPhone = () => Boolean(window.matchMedia?.(PHONE_QUERY).matches);

function Headline({ headline }) {
  const hasRate = headline.on_time_rate !== null;
  return (
    <section className="portal-overview-headline portal-overview-panel">
      {HEADLINE.map(([key, label]) => (
        <div key={key} className="portal-overview-stat">
          <b>{headline[key]}</b>
          <span>{label}</span>
          {key === 'due_soon' && headline.next_due && <small>Next due {formatDate(headline.next_due)}</small>}
        </div>
      ))}
      <div className="portal-overview-stat">
        <b>{hasRate ? `${headline.on_time_rate}%` : NO_RATE_DASH}</b>
        <span>On time</span>
        <small>{hasRate ? `${headline.shipped_on_time} of ${headline.shipped_total} shipped` : 'no shipped jobs yet'}</small>
      </div>
    </section>
  );
}

function Requests({ requests }) {
  return (
    <section className="portal-overview-requests">
      <header>
        <h2>Requests</h2>
        <Link to="/client-request/new">New request</Link>
      </header>
      {requests.map((request) => (
        <Link key={request.id} className="portal-overview-request" to={`/client-request/${request.id}`}>
          <code>REQ-{request.id}</code>
          <strong>{request.name}</strong>
          <span className={`portal-overview-status portal-overview-status--${request.status}`}>{statusLabel(request.status)}</span>
          <small>
            Sent {formatDate(request.submitted_at)} &middot; {request.line_count} lines
            {request.need_by && ` \u00b7 Need by ${formatDate(request.need_by)}`}
          </small>
        </Link>
      ))}
    </section>
  );
}

function PartsGrid({ parts, onOpen }) {
  return (
    <section className="portal-overview-parts portal-overview-panel">
      <header className="portal-parts-head">
        <h2>Parts</h2>
        <span>{parts.length}</span>
      </header>
      {parts.map((part) => (
        <div key={part.part_id} className="portal-parts-tile">
          <DrawingTile
            file={part.drawings[0]}
            width={PART_TILE_WIDTH_PX}
            aspect={PART_TILE_ASPECT}
            onOpen={() => onOpen(part)}
          />
          <div className="portal-parts-caption">{part.part_number}</div>
        </div>
      ))}
    </section>
  );
}

// Parts of the selected list come first in list order; the rest keep their order.
function orderParts(parts, list) {
  if (!list) return parts;
  const byId = new Map(parts.map((part) => [part.part_id, part]));
  const listed = list.part_ids.map((id) => byId.get(id)).filter(Boolean);
  return [...listed, ...parts.filter((part) => !list.part_ids.includes(part.part_id))];
}

const ClientOverview = () => {
  const phone = isPhone();
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [jobNotes, setJobNotes] = useState({});
  const [syncedAt, setSyncedAt] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [selectedListId, setSelectedListId] = useState(null);

  const loadNotes = useCallback(async () => {
    const result = await listNotes();
    if (result.ok) setJobNotes(result.data.jobs);
  }, []);

  useEffect(() => {
    if (phone) return undefined;
    const loaded = { current: false };
    // A failed refresh leaves the last good data in place; only the first load surfaces errors.
    const load = () => Promise.all([getOverview(), getSchedule(), getTicker(), listNotes()]).then(
      ([overviewResult, scheduleResult, tickerResult, notesResult]) => {
        if (overviewResult.ok) {
          setOverview(overviewResult.data);
          setError(null);
          loaded.current = true;
          setSyncedAt(new Date());
        } else if (!loaded.current) setError(overviewResult.error);
        if (scheduleResult.ok) setSchedule(scheduleResult.data);
        if (tickerResult.ok) setTicker(tickerResult.data);
        else setTicker((previous) => previous ?? []);
        if (notesResult.ok) setJobNotes(notesResult.data.jobs);
      },
    );
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [phone]);

  // Runs a list write, then reloads the overview so parts and lists stay current.
  const reloadAfter = async (write) => {
    setIsBusy(true);
    const result = await write();
    if (result.ok) {
      const fresh = await getOverview();
      if (fresh.ok) setOverview(fresh.data);
    }
    setIsBusy(false);
    return result.ok;
  };

  if (phone) return <Navigate to="/client-home" replace />;

  const openPart = (part) => navigate(`/client-part/${part.part_id}`);

  const status = syncedAt && (
    <span className="portal-live">Live &middot; synced {syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  );

  return (
    <PortalLayout title="Overview" wide hideTitle>
      {error && <PortalMessage kind={error.kind} message={error.message} />}
      {!overview && !error && <PortalMessage kind="loading" />}
      {overview && (
        <div className="portal-overview">
          <div className="portal-overview-left portal-overview-panel">
            <h2>Your jobs</h2>
            {overview.jobs.map((job) => (
              <JobRow key={job.id} job={job} notes={jobNotes[job.id] ?? []} onNoteAdded={loadNotes} compact />
            ))}
            <Requests requests={overview.requests} />
          </div>
          <div className="portal-overview-centre">
            <Headline headline={overview.headline} />
            {schedule && <OverviewSchedule schedule={schedule} now={new Date()} />}
            <PartsGrid
              parts={orderParts(overview.parts, overview.lists.find((list) => list.id === selectedListId))}
              onOpen={openPart}
            />
          </div>
          <div className="portal-overview-right">
            <OverviewRail
              lists={overview.lists}
              selectedListId={selectedListId}
              onSelectList={setSelectedListId}
              onCreate={(name) => reloadAfter(() => createList(name))}
              isBusy={isBusy}
            />
          </div>
          {ticker && (
            <div className="portal-overview-bottom">
              <OverviewTicker entries={ticker} />
              {status}
            </div>
          )}
        </div>
      )}
    </PortalLayout>
  );
};

export default ClientOverview;
