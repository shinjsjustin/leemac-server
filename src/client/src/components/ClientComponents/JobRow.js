import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { StageDot } from './StageBadge';
import JobNoteForm from './JobNoteForm';
import { isBlank } from './PortalField';
import { formatDate, plural } from '../../api/portalApi';
import '../Styling/PortalJobs.css';

const FADED_STAGES = ['shipped', 'invoiced'];

export default function JobRow({ job, notes, onNoteAdded, compact = false, current = false }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const isFaded = FADED_STAGES.includes(job.stage?.key);
  const className = `portal-job-row${isFaded ? ' portal-job-row--faded' : ''}${compact ? ' portal-job-row--compact' : ''}`;
  return (
    <div className="portal-job-row-wrap">
      <Link className={className} to={`/client-job/${job.id}`} aria-current={current ? 'page' : undefined}>
        <span className="portal-job-num">{job.job_number}</span>
        <StageDot stage={job.stage} flag={job.flag} />
        <span className="portal-job-bar">
          {job.parts.map((part) => (
            <span key={part.job_part_id} className={`portal-job-seg portal-job-seg--${part.stage?.key ?? 'none'}`} />
          ))}
        </span>
        {!isBlank(job.po_number) && <span className="portal-job-po">PO {job.po_number}</span>}
        {!isBlank(job.due_date)
          ? <span className="portal-job-due">Due {formatDate(job.due_date)}</span>
          : compact && <span className="portal-job-due">no due date</span>}
        <span className="portal-job-parts">{plural(job.parts.length, 'part')}</span>
        {!compact && !isBlank(job.po_date) && <span className="portal-job-ordered">Ordered {formatDate(job.po_date)}</span>}
      </Link>
      <button
        type="button"
        className="portal-job-note-btn"
        aria-label={`Notes on ${job.job_number}`}
        onClick={() => setIsFormOpen(true)}
      >
        Notes {notes.length}
      </button>
      {isFormOpen && (
        <JobNoteForm
          jobId={job.id}
          jobNumber={job.job_number}
          notes={notes}
          onNoteAdded={onNoteAdded}
          onClose={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
}
