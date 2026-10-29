import React, { useState, useEffect, useCallback } from 'react';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import JobRow from './JobRow';
import { listJobs } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';

const PAGE_SIZE = 20;

const ClientHome = () => {
    const [jobs, setJobs] = useState([]);
    const [nextOffset, setNextOffset] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [jobNotes, setJobNotes] = useState({});

    const loadNotes = useCallback(async () => {
        const result = await listNotes();
        // Notes are optional: a failure leaves the rows showing with no pins.
        if (result.ok) setJobNotes(result.data.jobs);
    }, []);

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

    useEffect(() => {
        loadPage(0);
        loadNotes();
    }, [loadPage, loadNotes]);

    const isFirstLoad = isLoading && jobs.length === 0;

    return (
        <PortalLayout title="Your jobs">
            {isFirstLoad && <PortalMessage kind="loading" />}
            {error && <PortalMessage kind={error.kind} message={error.message} />}
            {!isLoading && !error && jobs.length === 0 && (
                <PortalMessage kind="empty" message="You don't have any jobs with us yet." />
            )}
            {jobs.map((job) => (
                <JobRow key={job.id} job={job} notes={jobNotes[job.id] ?? []} onNoteAdded={loadNotes} />
            ))}
            {nextOffset !== null && !isLoading && (
                <button type="button" className="portal-button" onClick={() => loadPage(nextOffset)}>
                    Load more
                </button>
            )}
        </PortalLayout>
    );
};

export default ClientHome;
