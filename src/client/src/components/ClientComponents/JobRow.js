import React from 'react';
import { Link } from 'react-router-dom';
import StageBadge from './StageBadge';
import { NoteTarget } from './NotePin';
import { isBlank } from './PortalField';
import { formatDate } from '../../api/portalApi';
import '../Styling/PortalJobs.css';

const FADED_STAGES = ['shipped', 'invoiced'];

export default function JobRow({ job, notes, onNoteAdded, compact = false, current = false }) {
  const isFaded = FADED_STAGES.includes(job.stage?.key);
  const className = `portal-job-row${isFaded ? ' portal-job-row--faded' : ''}${compact ? ' portal-job-row--compact' : ''}`;
  return (
    <NoteTarget notes={notes} target={{ job_id: job.id }} onAdded={onNoteAdded}>
      <Link className={className} to={`/client-job/${job.id}`} aria-current={current ? 'page' : undefined}>
        <span className="portal-job-num">{job.job_number}</span>
        {compact
          ? job.stage && <span className={`portal-job-dot portal-job-dot--${job.stage.key}`}>{job.stage.label}</span>
          : <StageBadge stage={job.stage} flag={job.flag} />}
        <span className="portal-job-bar">
          {job.parts.map((part) => (
            <span key={part.job_part_id} className={`portal-job-seg portal-job-seg--${part.stage?.key ?? 'none'}`} />
          ))}
        </span>
        {!isBlank(job.po_number) && <span className="portal-job-po">PO {job.po_number}</span>}
        {!isBlank(job.due_date) && <span className="portal-job-due">Due {formatDate(job.due_date)}</span>}
        {compact && <span className="portal-job-parts">{job.parts.length} parts</span>}
      </Link>
    </NoteTarget>
  );
}
