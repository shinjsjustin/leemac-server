import React from 'react';
import { Link } from 'react-router-dom';
import StageBadge from './StageBadge';
import '../Styling/PortalOverview.css';

const defaultJobPath = (id) => `/client-job/${id}`;
const MS_PER_DAY = 86400000;
const WINDOW_DAYS = 28;
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toDay = (value) => {
  const iso = typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return Date.parse(`${iso}T00:00:00Z`);
};
const percent = (days) => `${(days / WINDOW_DAYS) * 100}%`;
const dateLabel = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const dayTick = (ms) => {
  const d = new Date(ms);
  return `${WEEKDAY_LETTERS[d.getUTCDay()]} ${d.getUTCDate()}`;
};

function groupByStage(board) {
  return board.reduce((groups, entry) => {
    const last = groups[groups.length - 1];
    if (last && last[0].stage.key === entry.stage.key) return [...groups.slice(0, -1), [...last, entry]];
    return [...groups, [entry]];
  }, []);
}

function BoardRow({ entry, dayOf, jobPath }) {
  const count = `${entry.part_count} ${entry.part_count === 1 ? 'part' : 'parts'}`;
  const isOpen = !entry.due_date;
  const first = Math.max(0, dayOf(entry.created_at));
  const last = Math.min(WINDOW_DAYS - 1, isOpen ? WINDOW_DAYS - 1 : dayOf(entry.due_date));
  const hasBar = first <= last;
  const body = (
    <>
      <span className="portal-board-label">
        <span className="portal-job-num">{entry.job_number}</span>
        {entry.company_name && <span className="portal-board-client">{entry.company_name}</span>}
        <StageBadge stage={entry.stage} flag={entry.own ? entry.flag : undefined} />
        <span className="portal-board-count">{count}</span>
      </span>
      <span className="portal-sched-track">
        {hasBar && (
          <span
            className={`portal-sched-bar portal-sched-bar--${entry.stage.key}${isOpen ? ' portal-sched-bar--open' : ''}`}
            style={{ left: percent(first), width: percent(last - first + 1) }}
          />
        )}
      </span>
    </>
  );
  if (!entry.own) return <div className="portal-board-row">{body}</div>;
  return (
    <Link className="portal-board-row" to={jobPath(entry.id)}>
      {body}
    </Link>
  );
}

export default function OverviewSchedule({ schedule, now, jobPath = defaultJobPath }) {
  const start = toDay(schedule.window.start);
  const dayOf = (value) => Math.round((toDay(value) - start) / MS_PER_DAY);
  const nowDay = dayOf(now);

  return (
    <section className="portal-overview-panel">
      <div className="portal-sched">
        <div className="portal-sched-title">
          Schedule {dateLabel(start)} – {dateLabel(toDay(schedule.window.end))} · bar = created to due
        </div>
        <div className="portal-sched-days">
          {Array.from({ length: WINDOW_DAYS }, (_, day) => (
            <span key={day} className="portal-sched-day">{dayTick(start + day * MS_PER_DAY)}</span>
          ))}
        </div>
      </div>
      <div className="portal-board">
        {nowDay >= 0 && nowDay < WINDOW_DAYS && (
          <div className="portal-sched-now-lane">
            <div className="portal-sched-now" style={{ left: percent(nowDay) }}><b>NOW</b></div>
          </div>
        )}
        {groupByStage(schedule.board).map((group) => (
          <div key={group[0].stage.key} className="portal-board-group">
            {group.map((entry) => (
              <BoardRow key={entry.own ? entry.id : entry.job_number} entry={entry} dayOf={dayOf} jobPath={jobPath} />
            ))}
          </div>
        ))}
        {(schedule.undated || []).map((job) => (
          <Link key={job.id} className="portal-board-row" to={jobPath(job.id)}>
            <span className="portal-job-num">{job.job_number}</span>
            {job.company_name && <span className="portal-board-client">{job.company_name}</span>}
            <StageBadge stage={job.stage} flag={job.flag} />
            <span className="portal-board-count">no due date</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
