import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import PortalDrawing, { NoDrawing } from './PortalDrawing';
import { getPart, formatDate } from '../../api/portalApi';

const NOT_FOUND_HEADING = "We couldn't find that part";
const NOT_FOUND_MESSAGE = "We couldn't find that part.";
const FACT_LABELS = [['rev', 'Rev'], ['material', 'Material'], ['finish', 'Finish']];

const ClientPartPage = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const jobParam = searchParams.get('job');
    const jobId = /^[1-9]\d*$/.test(jobParam) ? jobParam : null;
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

    const facts = FACT_LABELS
        .map(([key, label]) => [label, part.facts && part.facts[key]])
        .filter(([, value]) => value != null);

    return (
        <PortalLayout
            wide
            title={part.part_number}
            activePath={jobId ? `/client-job/${jobId}` : undefined}
            back={jobId
                ? <Link className="portal-back-link" to={`/client-job/${jobId}`}>Back to job</Link>
                : <Link className="portal-back-link" to="/client-parts">Back to parts</Link>}
        >
            <p className="portal-part-desc">{part.part_description}</p>
            <h2 className="portal-section-title">Drawings</h2>
            <div className="portal-drawings portal-drawings--large">
                {part.drawings.length === 0 && <NoDrawing size="large" />}
                {part.drawings.map((file) => <PortalDrawing key={file.id} file={file} size="large" />)}
            </div>
            {facts.length > 0 && (
                <dl className="portal-part-facts">
                    {facts.map(([label, value]) => (
                        <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                        </div>
                    ))}
                </dl>
            )}
            <h2 className="portal-section-title">Past orders</h2>
            <table className="portal-part-orders">
                <thead>
                    <tr><th>Job</th><th>Date</th><th>Qty</th></tr>
                </thead>
                <tbody>
                    {part.jobs.map((job) => (
                        <tr key={job.id}>
                            <td>
                                <Link className="portal-link portal-part-job-link" to={`/client-job/${job.id}`}>
                                    {job.job_number}
                                </Link>
                            </td>
                            <td>{job.po_date ? formatDate(job.po_date) : ''}</td>
                            <td>{job.quantity != null ? job.quantity : ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </PortalLayout>
    );
};

export default ClientPartPage;
