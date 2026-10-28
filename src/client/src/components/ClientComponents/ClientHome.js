import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PortalField, { isBlank } from './PortalField';
import PortalDrawing, { NoDrawing } from './PortalDrawing';
import { listJobs, listPartFiles, isDrawing, statusLabel, formatDate } from '../../api/portalApi';

const PAGE_SIZE = 20;

const partCount = (parts) => `${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`;

const distinctPartIds = (parts) => [...new Set(parts.map((part) => part.part_id))];

const moreDrawingsLabel = (count) => `${count} more ${count === 1 ? 'drawing' : 'drawings'}`;

const PartItem = ({ part, files, jobId }) => {
    const [firstDrawing, ...otherDrawings] = files.filter(isDrawing);
    const isShipped = part.status === 'shipped';
    return (
        <li className="portal-home-part">
            <div className="portal-home-part-info">
                <strong>{part.part_number}</strong>
                {!isBlank(part.part_description) && <p className="portal-part-desc">{part.part_description}</p>}
                <span className={`portal-badge${isShipped ? ' portal-badge--shipped' : ''}`}>
                    {statusLabel(part.status)}
                </span>
                <div className="portal-fields">
                    <PortalField label="Qty" value={part.quantity} />
                    <PortalField label="Rev" value={part.rev} />
                </div>
            </div>
            <div className="portal-home-part-preview">
                {firstDrawing
                    ? <PortalDrawing file={firstDrawing} size="landscape" />
                    : <NoDrawing size="landscape" />}
                {otherDrawings.length > 0 && (
                    <Link className="portal-more-drawings" to={`/client-job/${jobId}`}
                          aria-label={moreDrawingsLabel(otherDrawings.length)}>
                        +{otherDrawings.length}
                    </Link>
                )}
            </div>
        </li>
    );
};

const JobCard = ({ job }) => {
    const [isOpen, setIsOpen] = useState(false);
    // Keyed by part_id; stays cached so reopening never refetches.
    const [filesByPart, setFilesByPart] = useState(null);
    const [error, setError] = useState(null);
    const isShipped = job.status === 'shipped';
    const statusText = isShipped ? 'Shipped' : 'Open';
    const listId = `job-parts-${job.id}`;

    const toggle = async () => {
        setIsOpen(!isOpen);
        if (isOpen || filesByPart) return;
        const partIds = distinctPartIds(job.parts);
        const results = await Promise.all(partIds.map(listPartFiles));
        const failed = results.find((result) => !result.ok);
        if (failed) {
            setError(failed.error);
            return;
        }
        setError(null);
        setFilesByPart(Object.fromEntries(partIds.map((id, i) => [id, results[i].data])));
    };

    return (
        <div className="portal-card portal-job-card">
            <Link className="portal-job-link" to={`/client-job/${job.id}`}
                  aria-label={`Job ${job.job_number}, ${statusText}`}>
                <div className="portal-card-row">
                    <strong>{job.job_number}</strong>
                    <span className={`portal-badge${isShipped ? ' portal-badge--shipped' : ''}`}>
                        {statusText}
                    </span>
                </div>
                <div className="portal-fields">
                    <PortalField label="PO" value={job.po_number} />
                    <PortalField label="Due" value={job.due_date}>{formatDate(job.due_date)}</PortalField>
                    <PortalField label="Ship" value={job.ship_date}>{formatDate(job.ship_date)}</PortalField>
                </div>
                <div className="portal-meta">{partCount(job.parts)}</div>
            </Link>
            {job.parts.length > 0 && (
                <button type="button" className="portal-button portal-parts-toggle"
                        aria-expanded={isOpen} aria-controls={listId} onClick={toggle}>
                    {isOpen ? 'Hide parts' : 'Show parts'}
                </button>
            )}
            {isOpen && !filesByPart && !error && <PortalMessage kind="loading" />}
            {isOpen && error && <PortalMessage kind={error.kind} message={error.message} />}
            {isOpen && filesByPart && (
                <ul className="portal-job-parts" id={listId}>
                    {job.parts.map((part) => (
                        <PartItem key={part.job_part_id} part={part} files={filesByPart[part.part_id]} jobId={job.id} />
                    ))}
                </ul>
            )}
        </div>
    );
};

const ClientHome = () => {
    const [jobs, setJobs] = useState([]);
    const [nextOffset, setNextOffset] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadPage = useCallback(async (offset) => {
        setIsLoading(true);
        const result = await listJobs({ limit: PAGE_SIZE, offset });
        setIsLoading(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setError(null);
        setJobs((previous) => [...previous, ...result.data.jobs]);
        const { hasMore, offset: pageOffset, limit } = result.data.pagination;
        setNextOffset(hasMore ? pageOffset + limit : null);
    }, []);

    useEffect(() => { loadPage(0); }, [loadPage]);

    const isFirstLoad = isLoading && jobs.length === 0;

    return (
        <PortalLayout title="Your jobs" titleAside={<Link className="portal-link" to="/client-parts">Parts</Link>}>
            {isFirstLoad && <PortalMessage kind="loading" />}
            {error && <PortalMessage kind={error.kind} message={error.message} />}
            {!isLoading && !error && jobs.length === 0 && (
                <PortalMessage kind="empty" message="You don't have any jobs with us yet." />
            )}
            {jobs.map((job) => <JobCard key={job.id} job={job} />)}
            {nextOffset !== null && !isLoading && (
                <button type="button" className="portal-button" onClick={() => loadPage(nextOffset)}>
                    Load more
                </button>
            )}
        </PortalLayout>
    );
};

export default ClientHome;
