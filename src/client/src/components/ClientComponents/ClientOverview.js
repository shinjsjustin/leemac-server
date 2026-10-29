import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import JobRow from './JobRow';
import StageBadge from './StageBadge';
import DrawingTile from './DrawingTile';
import DrawingWindows, { useDrawingWindows } from './DrawingWindows';
import OverviewSchedule from './OverviewSchedule';
import OverviewTicker from './OverviewTicker';
import OverviewRail from './OverviewRail';
import { getOverview, getSchedule, getTicker, getPart, formatDate, statusLabel } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import { createList, renameList, deleteList } from '../../api/portalListsApi';
import '../Styling/PortalOverview.css';

const PHONE_QUERY = '(max-width: 599px)';
const WALL_TILE_WIDTH_PX = 240;
const WALL_TILE_ASPECT = 1.4;
const HEADLINE = [
  ['active_jobs', 'Active jobs'],
  ['due_soon', 'Due soon'],
  ['overdue', 'Overdue'],
];
const REFRESH_MS = 60000;
const NO_RATE_DASH = '\u2014';

const toWindow = (part) => ({
  key: part.part_id,
  part_number: part.part_number,
  description: part.part_description,
  drawing: part.drawings[0] ?? null,
});

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

function Wall({ wall, partCount, onOpen }) {
  return (
    <section className="portal-overview-wall portal-overview-panel">
      <header className="portal-wall-head">
        <h2>Live from the shop floor</h2>
        <span>All {partCount} parts</span>
      </header>
      {wall.length === 0 && <p className="portal-wall-empty">Nothing on the machines for you right now</p>}
      {wall.map((entry) => (
        <div key={entry.job_part_id} className="portal-wall-tile">
          <DrawingTile
            file={entry.drawing}
            width={WALL_TILE_WIDTH_PX}
            aspect={WALL_TILE_ASPECT}
            onOpen={() => onOpen(entry)}
          />
          <div className="portal-wall-caption">
            <StageBadge stage={entry.stage} />
            <span className="portal-job-num">{entry.job_number}</span>
            <span>{entry.part_number}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

const ClientOverview = () => {
  const phone = isPhone();
  const windows = useDrawingWindows();
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [ticker, setTicker] = useState(null);
  const [jobNotes, setJobNotes] = useState({});
  const [syncedAt, setSyncedAt] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

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

  const openWall = (entry) => windows.openPart({
    key: entry.job_part_id,
    partId: entry.part_id,
    part_number: entry.part_number,
    rev: entry.rev,
    stage: entry.stage,
    job_number: entry.job_number,
    drawing: entry.drawing,
  });

  const status = syncedAt && (
    <span className="portal-live">Live &middot; synced {syncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
  );

  return (
    <PortalLayout title="Overview" wide hideTitle dark status={status}>
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
            <Wall wall={overview.wall} partCount={overview.parts.length} onOpen={openWall} />
          </div>
          <div className="portal-overview-right">
            <OverviewRail
              parts={overview.parts}
              lists={overview.lists}
              openNumbers={Object.fromEntries(windows.open.map((p, index) => [p.key, index + 1]))}
              focusedKey={windows.focusedKey}
              onOpenPart={(part) => windows.openPart(toWindow(part))}
              onCreate={(name) => reloadAfter(() => createList(name))}
              onRename={(id, name) => reloadAfter(() => renameList(id, name))}
              onDelete={(id) => reloadAfter(() => deleteList(id))}
              isBusy={isBusy}
            />
          </div>
          {ticker && <div className="portal-overview-bottom"><OverviewTicker entries={ticker} /></div>}
        </div>
      )}
      <DrawingWindows
        windows={windows.open}
        focusedKey={windows.focusedKey}
        onFocus={windows.focus}
        onClose={windows.close}
        onCloseAll={windows.closeAll}
        loadPart={getPart}
      />
    </PortalLayout>
  );
};

export default ClientOverview;
