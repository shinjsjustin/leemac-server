import React, { useState, useEffect, useCallback, useRef } from 'react';
import PortalMessage from './PortalMessage';
import JobRow from './JobRow';
import { listJobs } from '../../api/portalApi';
import { listNotes } from '../../api/portalNotesApi';
import '../Styling/PortalJobs.css';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const JobList = ({ compact = false, currentId, notes, onNoteAdded }) => {
    const [jobs, setJobs] = useState([]);
    const [total, setTotal] = useState(0);
    const [nextOffset, setNextOffset] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [ownNotes, setOwnNotes] = useState({});
    const [query, setQuery] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const latestRequest = useRef(0);

    const loadNotes = useCallback(async () => {
        const result = await listNotes();
        // Notes are optional: a failure leaves the rows showing with no pins.
        if (result.ok) setOwnNotes(result.data.jobs);
    }, []);

    const loadPage = useCallback(async (offset, q) => {
        const request = ++latestRequest.current;
        setIsLoading(true);
        const result = await listJobs({ limit: PAGE_SIZE, offset, q: q || undefined });
        // A newer search superseded this response.
        if (request !== latestRequest.current) return;
        setIsLoading(false);
        if (!result.ok) {
            setError(result.error);
            return;
        }
        setError(null);
        setJobs((previous) => (offset === 0 ? result.data.jobs : [...previous, ...result.data.jobs]));
        const { hasMore, offset: pageOffset, limit, total: count } = result.data.pagination;
        setTotal(count);
        setNextOffset(hasMore ? pageOffset + limit : null);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => setSearchTerm(query), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [query]);

    useEffect(() => { loadPage(0, searchTerm); }, [loadPage, searchTerm]);

    const hasOwnNotes = notes === undefined;
    useEffect(() => {
        if (hasOwnNotes) loadNotes();
    }, [hasOwnNotes, loadNotes]);

    const noteMap = hasOwnNotes ? ownNotes : notes;
    const refreshNotes = onNoteAdded ?? loadNotes;
    const isFirstLoad = isLoading && jobs.length === 0;
    const isEmpty = !isLoading && !error && jobs.length === 0;
    const olderCount = total - jobs.length;

    return (
        <section className="portal-joblist">
            <div className="portal-joblist-head">
                <h2>Your jobs · {total}</h2>
                <input
                    type="search"
                    className="portal-input"
                    aria-label="Job, PO or part number"
                    placeholder="Job, PO or part number"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </div>
            {isFirstLoad && <PortalMessage kind="loading" />}
            {error && <PortalMessage kind={error.kind} message={error.message} />}
            {isEmpty && searchTerm && <PortalMessage kind="empty" heading="No jobs match" message="Try a different job, PO or part number." />}
            {isEmpty && !searchTerm && <PortalMessage kind="empty" message="You don't have any jobs with us yet." />}
            {jobs.map((job) => (
                <JobRow
                    key={job.id}
                    job={job}
                    compact={compact}
                    current={job.id === currentId}
                    notes={noteMap[job.id] ?? []}
                    onNoteAdded={refreshNotes}
                />
            ))}
            {nextOffset !== null && !isLoading && (
                <button type="button" className="portal-button" onClick={() => loadPage(nextOffset, searchTerm)}>
                    {olderCount} older {olderCount === 1 ? 'job' : 'jobs'}
                </button>
            )}
        </section>
    );
};

export default JobList;
