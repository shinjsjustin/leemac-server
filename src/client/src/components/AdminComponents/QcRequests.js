import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import AdminLayout from '../AdminLayout/AdminLayout';
import { dismissQcRequest, listQcRequests } from '../../api/qcAdminApi';
import { canWrite } from '../../config/access';
import { pingedLabel, splitRequests, statusLabel } from './qcRequestsView';
import '../Styling/QcRequests.css';

const accessLevel = () => {
  const token = localStorage.getItem('token');
  return token ? jwtDecode(token).access ?? 0 : 0;
};

function RequestRow({ row, now, onDismiss }) {
  return (
    <tr>
      <td>{pingedLabel(row.pinged_at, now)}</td>
      <td><b>{row.company_name}</b> {row.contact}</td>
      <td><Link to={`/part/${row.part_id}`}>{row.part_number}</Link></td>
      <td>
        {row.newest_job_id ? <Link to={`/job/${row.newest_job_id}`}>{row.newest_job_number}</Link> : '—'}
      </td>
      <td>{row.marking_count}</td>
      <td>{row.photo_count}</td>
      <td>{row.ping_count}</td>
      <td>{statusLabel(row)}</td>
      <td>{onDismiss && <button type="button" onClick={() => onDismiss(row.id)}>Dismiss</button>}</td>
    </tr>
  );
}

function RequestTable({ rows, now, onDismiss }) {
  return (
    <table className="qc-table">
      <thead>
        <tr>
          <th>Pinged</th><th>Client</th><th>Part</th><th>Job</th>
          <th>Markings</th><th>Photos</th><th>Pings</th><th>Status</th><th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => <RequestRow key={row.id} row={row} now={now} onDismiss={onDismiss} />)}
      </tbody>
    </table>
  );
}

export default function QcRequests() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const canDismiss = canWrite(accessLevel());

  const load = useCallback(async () => {
    const result = await listQcRequests();
    if (result.ok) setRows(result.data);
    else setError(result.error.message);
  }, []);

  useEffect(() => { load(); }, [load]);

  const dismiss = async (id) => {
    const result = await dismissQcRequest(id);
    if (result.ok) { setError(null); load(); } else setError(result.error.message);
  };

  let body;
  if (rows === null) body = error ? null : <p>Loading…</p>;
  else {
    const { open, closed } = splitRequests(rows);
    const now = new Date();
    body = (
      <>
        <h3>Open</h3>
        {open.length === 0 ? <p>No open requests.</p> : <RequestTable rows={open} now={now} onDismiss={canDismiss ? dismiss : null} />}
        <h3>Answered, last 30 days</h3>
        {closed.length === 0 ? <p>None.</p> : <RequestTable rows={closed} now={now} onDismiss={null} />}
      </>
    );
  }

  return (
    <AdminLayout current="qc-requests" crumb="Shop floor / QC requests">
      <div className="qc-page">
        {error && <p className="qc-error">{error}</p>}
        {body}
      </div>
    </AdminLayout>
  );
}
