import React from 'react';
import { Link } from 'react-router-dom';
import StageBadge from './StageBadge';
import '../Styling/PortalOverview.css';

const MS_PER_DAY = 86400000;
const WINDOW_DAYS = 28;
const DAYS_PER_WEEK = 7;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toDay = (value) => {
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return Date.parse(`${iso}T00:00:00Z`);
};
const percent = (days) => `${(days / WINDOW_DAYS) * 100}%`;
const weekLabel = (startMs, week) => {
  const d = new Date(startMs + week * DAYS_PER_WEEK * MS_PER_DAY);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

function groupByStage(board) {
  return board.reduce((groups, entry) => {
    const last = groups[groups.length - 1];
    if (last && last[0].stage.key === entry.stage.key) return [...groups.slice(0, -1), [...last, entry]];
    return [...groups, [entry]];
  }, []);
}

function BoardRow({ entry }) {
  const count = `${entry.part_count} ${entry.part_count === 1 ? 'part' : 'parts'}`;
  const body = (
    <>
      <span className="portal-job-num">{entry.job_number}</span>
      <StageBadge stage={entry.stage} flag={entry.own ? entry.flag : undefined} />
      <span className="portal-board-count">{count}</span>
    </>
  );
  if (!entry.own) return <div className="portal-board-row">{body}</div>;
  return (
    <Link className="portal-board-row" to={`/client-job/${entry.id}`}>
      {body}
    </Link>
  );
}

export default function OverviewSchedule({ schedule, now }) {
  const start = toDay(schedule.window.start);
  const dayOf = (value) => Math.round((toDay(value) - start) / MS_PER_DAY);
  const nowDay = dayOf(now);

  return (
    <section className="portal-overview-panel">
      <div className="portal-sched">
        <div className="portal-sched-weeks">
          {Array.from({ length: WINDOW_DAYS / DAYS_PER_WEEK }, (_, week) => (
            <span key={week} className="portal-sched-week">{weekLabel(start, week)}</span>
          ))}
        </div>
        <div className="portal-sched-rows">
          {schedule.timeline.map((job) => {
            const first = Math.max(0, dayOf(job.start));
            const last = Math.min(WINDOW_DAYS - 1, dayOf(job.due_date));
            const shipDay = job.ship_date ? dayOf(job.ship_date) : -1;
            return (
              <div key={job.id} className="portal-sched-row">
                <span
                  className={`portal-sched-bar portal-sched-bar--${job.stage.key}`}
                  style={{ left: percent(first), width: percent(last - first + 1) }}
                >
                  {job.job_number}
                </span>
                {shipDay >= 0 && shipDay < WINDOW_DAYS && (
                  <span className="portal-sched-ship" style={{ left: percent(shipDay) }} />
                )}
              </div>
            );
          })}
          {nowDay >= 0 && nowDay < WINDOW_DAYS && (
            <div className="portal-sched-now" style={{ left: percent(nowDay) }}><b>NOW</b></div>
          )}
        </div>
      </div>
      <div className="portal-board">
        {groupByStage(schedule.board).map((group) => (
          <div key={group[0].stage.key} className="portal-board-group">
            {group.map((entry) => (
              <BoardRow key={entry.own ? entry.id : entry.job_number} entry={entry} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
