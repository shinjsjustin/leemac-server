import React from 'react';
import { Link } from 'react-router-dom';
import { formatDate, plural, timeAgo } from '../../api/portalApi';
import { requestStatusLabel } from '../../api/portalRequestsApi';
import '../Styling/PortalRequests.css';

const ID_DIGITS = 4;

export const requestCode = (id) => `REQ-${String(id).padStart(ID_DIGITS, '0')}`;

const statusText = (request) => {
  if (request.job_number) return `Job ${request.job_number}`;
  return request.status === 'sent' && request.job_id ? 'Job created' : requestStatusLabel(request.status);
};

const metaText = (request) => {
  const lines = plural(request.line_count, 'line');
  const parts = [lines, ...(request.from_list ? ['from list'] : []), `Updated ${timeAgo(request.updated_at)}`];
  if (request.need_by) parts.push(`Need by ${formatDate(request.need_by)}`);
  return parts.join(' · ');
};

function RequestRow({ request, isCurrent }) {
  return (
    <Link
      className={`portal-req-row${isCurrent ? ' portal-req-row--current' : ''}`}
      to={`/client-request/${request.id}`}
      aria-current={isCurrent ? 'page' : undefined}
    >
      <span className="portal-req-top">
        <b className="portal-req-id">{requestCode(request.id)}</b>
        <span className={`portal-req-status portal-req-status--${request.status}`}>{statusText(request)}</span>
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
            <Link className="portal-link" to={`/client-parts?request=${list.id}`}>Request</Link>
          </div>
        ))}
      </section>
    )}
  </aside>
);

export default RequestRail;
