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
import { getOverview, getSchedule, getTicker, formatDate, statusLabel } from '../../api/portalApi';
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
const NO_RATE_DASH = '\u2014';

const toWindow = (part) => ({
  key: part.part_id,
  part_number: part.part_number,
  description: part.part_description,
  drawing: part.drawings[0] ?? null,
});

const isPhone = () => Boolean(window.matchMedia?.(PHONE_QUERY).matches);

const dataOrNull = (result) => (result.ok ? result.data : null);

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
      <h2>Requests</h2>
      {requests.map((request) => (
        <Link key={request.id} className="portal-overview-request" to={`/client-request/${request.id}`}>
          <strong>{request.name}</strong>
          <span>{statusLabel(request.status)}</span>
          {request.need_by && <span>Need by {formatDate(request.need_by)}</span>}
        </Link>
      ))}
      <Link className="portal-button" to="/client-request/new">New request</Link>
    </section>
  );
}

function Wall({ wall, onOpen }) {
  return (
    <section className="portal-overview-wall portal-overview-panel">
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
  const [isBusy, setIsBusy] = useState(false);

  const loadNotes = useCallback(async () => {
    const result = await listNotes();
    if (result.ok) setJobNotes(result.data.jobs);
  }, []);

  useEffect(() => {
    if (phone) return;
    Promise.all([getOverview(), getSchedule(), getTicker(), listNotes()]).then(
      ([overviewResult, scheduleResult, tickerResult, notesResult]) => {
        if (overviewResult.ok) setOverview(overviewResult.data);
        else setError(overviewResult.error);
        setSchedule(dataOrNull(scheduleResult));
        setTicker(tickerResult.ok ? tickerResult.data : []);
        if (notesResult.ok) setJobNotes(notesResult.data.jobs);
      },
    );
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
    part_number: entry.part_number,
    rev: entry.rev,
    stage: entry.stage,
    job_number: entry.job_number,
    drawing: entry.drawing,
  });

  return (
    <PortalLayout title="Overview" wide hideTitle dark>
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
            <Wall wall={overview.wall} onOpen={openWall} />
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
      />
    </PortalLayout>
  );
};

export default ClientOverview;
