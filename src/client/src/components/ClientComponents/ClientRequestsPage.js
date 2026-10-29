import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import { formatDate } from '../../api/portalApi';
import { listRequests, requestStatusLabel, formatLocalDate } from '../../api/portalRequestsApi';

const EMPTY_MESSAGE = 'You have no requests yet. Start a Quick New Parts List to ask for a quote.';

const ClientRequestsPage = () => {
    const [requests, setRequests] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        listRequests().then((result) => {
            if (!isCurrent) return;
            setIsLoading(false);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setRequests(result.data);
        });
        return () => { isCurrent = false; };
    }, []);

    return (
        <PortalLayout
            title="Your requests"
            titleAside={<Link className="portal-button" to="/client-request/new">Quick New Parts List</Link>}
        >
            {isLoading && <PortalMessage kind="loading" />}
            {error && <PortalMessage kind={error.kind} message={error.message} />}
            {!isLoading && !error && requests.length === 0 && (
                <PortalMessage kind="empty" message={EMPTY_MESSAGE} />
            )}
            {requests.map((request) => (
                <Link key={request.id} className="portal-card portal-request-card" to={`/client-request/${request.id}`}>
                    <strong>{request.name || `Request #${request.id}`}</strong>
                    <span className="portal-badge">{requestStatusLabel(request.status)}</span>
                    <p>Need by: {formatDate(request.need_by)}</p>
                    <p>Last updated: {formatLocalDate(request.updated_at)}</p>
                </Link>
            ))}
        </PortalLayout>
    );
};

export default ClientRequestsPage;
