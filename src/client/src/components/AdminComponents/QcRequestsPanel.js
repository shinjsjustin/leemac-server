import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { dismissQcRequest, listQcRequests } from '../../api/qcAdminApi';
import { canWrite } from '../../config/access';
import { pingedLabel, splitRequests, statusLabel } from './qcRequestsView';
import '../Styling/QcRequests.css';

const MIN_QC_ACCESS = 2;

const accessLevel = () => {
  const token = localStorage.getItem('token');
  return token ? jwtDecode(token).access ?? 0 : 0;
};

export default function QcRequestsPanel() {
  const access = accessLevel();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const result = await listQcRequests();
    if (result.ok) setRows(splitRequests(result.data).open);
  }, []);

  useEffect(() => {
    if (access >= MIN_QC_ACCESS) load();
  }, [access, load]);

  const dismiss = async (id) => {
    const result = await dismissQcRequest(id);
    if (result.ok) {
      setError(null);
      setRows((prev) => prev.filter((row) => row.id !== id));
    } else {
      setError(result.error.message);
    }
  };

  if (access < MIN_QC_ACCESS || rows.length === 0) return null;
  const now = new Date();
  return (
    <section className="qc-panel">
      <header>
        <b>QC requests</b> <span>검사</span>
        <Link to="/qc-requests" className="qc-all">All QC requests</Link>
      </header>
      {error && <p className="qc-error">{error}</p>}
      {rows.map((row) => (
        <div className="qc-panel-row" key={row.id}>
          <span className="qc-when">{pingedLabel(row.pinged_at, now)}</span>
          <span className="qc-who"><b>{row.company_name}</b> {row.contact}</span>
          <span className="qc-part">{row.part_number}</span>
          <span className="qc-status">{statusLabel(row)}</span>
          <Link to={`/part/${row.part_id}`} className="qc-open">Open</Link>
          {canWrite(access) && (
            <button type="button" onClick={() => dismiss(row.id)}>Dismiss</button>
          )}
        </div>
      ))}
    </section>
  );
}
