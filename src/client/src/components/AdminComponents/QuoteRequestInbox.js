import React from 'react';
import AdminLayout from '../AdminLayout/AdminLayout';
import RequestInboxRail from '../QuoteRequests/RequestInboxRail';

const QuoteRequestInbox = () => (
    <AdminLayout current="quote-requests" crumb="Quote requests">
        <div className="request-inbox-wrap">
            <RequestInboxRail />
            <div className="request-pick">Pick a request</div>
        </div>
    </AdminLayout>
);

export default QuoteRequestInbox;
