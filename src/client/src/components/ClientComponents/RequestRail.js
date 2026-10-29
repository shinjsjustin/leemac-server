import React from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../api/portalApi';
import { requestStatusLabel, formatLocalDate } from '../../api/portalRequestsApi';
import '../Styling/PortalRequests.css';

const ID_DIGITS = 4;

const statusText = (request) =>
  (request.status === 'sent' && request.job_id ? 'Job created' : requestStatusLabel(request.status));

const metaText = (request) => {
  const updated = `Updated ${formatLocalDate(request.updated_at)}`;
  return request.need_by ? `${updated} · Need by ${formatDate(request.need_by)}` : updated;
};

function RequestRow({ request, isCurrent }) {
  return (
    <Link
      className={`portal-req-row${isCurrent ? ' portal-req-row--current' : ''}`}
      to={`/client-request/${request.id}`}
      aria-current={isCurrent ? 'page' : undefined}
    >
      <span className="portal-req-top">
        <b className="portal-req-id">REQ-{String(request.id).padStart(ID_DIGITS, '0')}</b>
        <span className="portal-req-status">{statusText(request)}</span>
      </span>
      <span className="portal-req-name">{request.name || `Request #${request.id}`}</span>
      <span className="portal-req-meta">{metaText(request)}</span>
    </Link>
  );
}

const RequestRail = ({ requests, lists, currentId }) => (
  <aside className="portal-req-rail">
    <Link className="portal-button" to="/client-request/new">+ New request</Link>
    <h2 className="portal-req-heading">
      Your requests <span className="portal-req-count">{requests.length}</span>
    </h2>
    {requests.map((request) => (
      <RequestRow key={request.id} request={request} isCurrent={request.id === currentId} />
    ))}
    {lists.length > 0 && (
      <section>
        <h2 className="portal-req-heading">Start from a list</h2>
        {lists.map((list) => (
          <div key={list.id} className="portal-req-list">
            <b className="portal-req-name">{list.name}</b>
            <span className="portal-req-meta">
              {list.part_ids.length} {list.part_ids.length === 1 ? 'part' : 'parts'}
            </span>
            <Link className="portal-link" to="/client-parts">Request</Link>
          </div>
        ))}
      </section>
    )}
  </aside>
);

export default RequestRail;
