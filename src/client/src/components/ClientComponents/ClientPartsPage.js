import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PartPdfPreview from '../PartPdfPreview';
import useSavedSearch from '../../hooks/useSavedSearch';
import { listParts } from '../../api/portalApi';

const VISIBLE_JOBS = 3;
const QUIET_BUTTON = 'portal-button portal-button--quiet';

// Job links must not trigger the row's navigation.
const stopPropagation = (event) => event.stopPropagation();

const PartRow = ({ part, onOpen }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const hiddenCount = part.jobs.length - VISIBLE_JOBS;
    const shownJobs = isExpanded ? part.jobs : part.jobs.slice(0, VISIBLE_JOBS);

    return (
        <div className="portal-card portal-part-row" onClick={() => onOpen(part.part_id)}>
            <strong>{part.part_number}</strong>
            <p className="portal-part-desc">{part.part_description}</p>
            <div className="portal-part-jobs">
                {shownJobs.map((job) => (
                    <Link key={job.id} className="portal-part-job-link"
                          to={`/client-job/${job.id}`} onClick={stopPropagation}>
                        {job.job_number}
                    </Link>
                ))}
                {!isExpanded && hiddenCount > 0 && (
                    <button type="button" className="portal-button portal-part-more"
                            onClick={(event) => { event.stopPropagation(); setIsExpanded(true); }}>
                        {`+${hiddenCount} more`}
                    </button>
                )}
            </div>
            <PartPdfPreview file={part.latest_drawing} drawingCount={part.drawing_count}
                            toggleClassName={QUIET_BUTTON} />
        </div>
    );
};

const ClientPartsPage = () => {
    const navigate = useNavigate();
    const {
        number, description, searchNum, setSearchNum, searchDesc, setSearchDesc,
        applyNumber, applyDescription, clear,
    } = useSavedSearch('clientPartListSearch');
    const [parts, setParts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        setIsLoading(true);
        setError(null);
        listParts({ number, description }).then((result) => {
            if (!isCurrent) return;
            setIsLoading(false);
            if (!result.ok) {
                setError(result.error);
                setParts([]);
                return;
            }
            setError(null);
            setParts(result.data);
        });
        return () => { isCurrent = false; };
    }, [number, description]);

    const isSearching = Boolean(number || description);

    return (
        <PortalLayout
            title="Your parts"
            back={<Link className="portal-back-link" to="/client-home">Back to your jobs</Link>}
        >
            <div className="portal-search">
                <div className="portal-search-row">
                    <input type="text" className="portal-input" aria-label="Number search"
                           placeholder="Part number" value={searchNum}
                           onChange={(e) => setSearchNum(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && applyNumber()} />
                    <button type="button" className={QUIET_BUTTON} aria-label="Search part number"
                            onClick={applyNumber}>Search</button>
                </div>
                <div className="portal-search-row">
                    <input type="text" className="portal-input" aria-label="Description search"
                           placeholder="Description" value={searchDesc}
                           onChange={(e) => setSearchDesc(e.target.value)}
                           onKeyDown={(e) => e.key === 'Enter' && applyDescription()} />
                    <button type="button" className={QUIET_BUTTON} aria-label="Search description"
                            onClick={applyDescription}>Search</button>
                </div>
                {isSearching && <button type="button" className={QUIET_BUTTON} onClick={clear}>Clear</button>}
            </div>
            {isLoading && <PortalMessage kind="loading" />}
            {error && <PortalMessage kind={error.kind} message={error.message} />}
            {!isLoading && !error && parts.length === 0 && (
                <PortalMessage kind="empty" message={isSearching
                    ? 'No parts match your search.'
                    : "You don't have any parts with us yet."} />
            )}
            {parts.map((part) => (
                <PartRow key={part.part_id} part={part} onOpen={(id) => navigate(`/client-part/${id}`)} />
            ))}
        </PortalLayout>
    );
};

export default ClientPartsPage;
