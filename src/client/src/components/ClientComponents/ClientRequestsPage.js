import React, { useState, useEffect } from 'react';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import { Link } from 'react-router-dom';
import RequestRail from './RequestRail';
import { listRequests } from '../../api/portalRequestsApi';
import { listLists } from '../../api/portalListsApi';

const EMPTY_MESSAGE = 'You have no requests yet. Start a Quick New Parts List to ask for a quote.';

const ClientRequestsPage = () => {
    const [requests, setRequests] = useState([]);
    const [lists, setLists] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isCurrent = true;
        Promise.all([listRequests(), listLists()]).then(([result, listsResult]) => {
            if (!isCurrent) return;
            setIsLoading(false);
            if (!result.ok) {
                setError(result.error);
                return;
            }
            setRequests(result.data);
            if (listsResult.ok) setLists(listsResult.data);
        });
        return () => { isCurrent = false; };
    }, []);

    return (
        <PortalLayout title="Your requests">
            {isLoading && <PortalMessage kind="loading" />}
            {error && <PortalMessage kind={error.kind} message={error.message} />}
            {!isLoading && !error && requests.length === 0 && (
                <PortalMessage kind="empty" message={EMPTY_MESSAGE} />
            )}
            {!isLoading && !error && (
                <div className={`portal-req-page${requests.length > 0 ? ' portal-req-page--request' : ''}`}>
                    <RequestRail requests={requests} lists={lists} />
                    {requests.length > 0 && (
                        <div className="portal-req-empty">
                            <p>Pick a request, or start a new one</p>
                            <Link className="portal-link" to="/client-request/new">+ New request</Link>
                        </div>
                    )}
                </div>
            )}
        </PortalLayout>
    );
};

export default ClientRequestsPage;
