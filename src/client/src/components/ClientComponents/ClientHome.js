import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import { listJobs } from '../../api/portalApi';

const JOB_LIMIT = 100;

// The server orders by created_at, so pick the top job by number instead.
const topJob = (jobs) => jobs.reduce((best, j) => (
    j.job_number.localeCompare(best.job_number, undefined, { numeric: true }) > 0 ? j : best
));

const ClientHome = () => {
    const [result, setResult] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        listJobs({ limit: JOB_LIMIT, offset: 0 }).then((res) => {
            if (isCurrent) setResult(res);
        });
        return () => { isCurrent = false; };
    }, []);

    if (result?.ok && result.data.jobs.length) {
        return <Navigate to={`/client-job/${topJob(result.data.jobs).id}`} replace />;
    }

    let message = <PortalMessage kind="loading" />;
    if (result && !result.ok) {
        message = <PortalMessage kind={result.error.kind} message={result.error.message} />;
    } else if (result) {
        message = <PortalMessage kind="empty" heading="No jobs yet" message="You don't have any jobs with us yet." />;
    }

    return (
        <PortalLayout title="Your jobs" wide hideTitle>
            {message}
        </PortalLayout>
    );
};

export default ClientHome;
