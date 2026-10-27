import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PortalField, { isBlank } from './PortalField';
import PortalDrawing, { NoDrawing } from './PortalDrawing';
import { listJobs, listPartFiles, isDrawing, formatDate } from '../../api/portalApi';

const PAGE_SIZE = 20;

const partCount = (parts) => `${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`;

const distinctPartIds = (parts) => [...new Set(parts.map((part) => part.part_id))];

const PartItem = ({ part, files }) => {
    const drawings = files.filter(isDrawing);
    return (
        <li>
            <strong>{part.part_number}</strong>
            {!isBlank(part.part_description) && <p className="portal-part-desc">{part.part_description}</p>}
            <div className="portal-drawings">
                {drawings.length === 0 && <NoDrawing />}
                {drawings.map((file) => <PortalDrawing key={file.id} file={file} />)}
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
                        <PartItem key={part.job_part_id} part={part} files={filesByPart[part.part_id]} />
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
        <PortalLayout title="Your jobs">
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
