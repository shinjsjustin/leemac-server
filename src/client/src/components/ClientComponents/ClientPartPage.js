import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PortalDrawing, { NoDrawing } from './PortalDrawing';
import { getPart } from '../../api/portalApi';

const NOT_FOUND_HEADING = "We couldn't find that part";
const NOT_FOUND_MESSAGE = "We couldn't find that part.";

const ClientPartPage = () => {
    const { id } = useParams();
    const [part, setPart] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        getPart(id).then((result) => {
            if (!isCurrent) return;
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setPart(result.data);
        });
        return () => { isCurrent = false; };
    }, [id]);

    if (error) {
        const isNotFound = error.kind === 'not_found';
        const message = isNotFound ? NOT_FOUND_MESSAGE : error.message;
        const heading = isNotFound ? NOT_FOUND_HEADING : undefined;
        return <PortalLayout title="Part"><PortalMessage kind={error.kind} message={message} heading={heading} /></PortalLayout>;
    }
    if (!part) {
        return <PortalLayout title="Part"><PortalMessage kind="loading" /></PortalLayout>;
    }

    return (
        <PortalLayout
            title={part.part_number}
            back={<Link className="portal-back-link" to="/client-parts">Back to parts</Link>}
        >
            <p className="portal-part-desc">{part.part_description}</p>
            <h2 className="portal-section-title">Jobs</h2>
            <div className="portal-part-jobs">
                {part.jobs.map((job) => (
                    <Link key={job.id} className="portal-link portal-part-job-link" to={`/client-job/${job.id}`}>
                        {job.job_number}
                    </Link>
                ))}
            </div>
            <h2 className="portal-section-title">Drawings</h2>
            <div className="portal-drawings portal-drawings--large">
                {part.drawings.length === 0 && <NoDrawing size="large" />}
                {part.drawings.map((file) => <PortalDrawing key={file.id} file={file} size="large" />)}
            </div>
        </PortalLayout>
    );
};

export default ClientPartPage;
