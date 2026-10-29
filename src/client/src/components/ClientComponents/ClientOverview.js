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
import { getOverview, getSchedule, getTicker, formatDate, statusLabel } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import '../Styling/PortalOverview.css';

const PHONE_QUERY = '(max-width: 599px)';
const WALL_TILE_WIDTH_PX = 240;
const WALL_TILE_ASPECT = 1.4;
const HEADLINE = [
  ['active_jobs', 'Active jobs'],
  ['due_soon', 'Due soon'],
  ['overdue', 'Overdue'],
  ['parts_in_shop', 'Parts in shop'],
];

const isPhone = () => Boolean(window.matchMedia?.(PHONE_QUERY).matches);

const dataOrNull = (result) => (result.ok ? result.data : null);

function Headline({ headline }) {
  return (
    <section className="portal-overview-headline">
      {HEADLINE.map(([key, label]) => (
        <div key={key} className="portal-overview-stat"><b>{headline[key]}</b><span>{label}</span></div>
      ))}
      {headline.on_time_rate !== null && (
        <div className="portal-overview-stat"><b>{headline.on_time_rate}%</b><span>On time</span></div>
      )}
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
    <section className="portal-overview-wall">
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
    <PortalLayout title="Overview" wide hideTitle>
      {error && <PortalMessage kind={error.kind} message={error.message} />}
      {!overview && !error && <PortalMessage kind="loading" />}
      {overview && (
        <div className="portal-overview">
          <div className="portal-overview-left">
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
