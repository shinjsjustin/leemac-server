import React, { useCallback, useEffect, useState } from 'react';
import { listDocuments, makeDocument } from '../../api/jobDocumentsApi';
import PrintActions from '../PrintActions';
import './jobSide.css';
import './jobDocuments.css';

const MAKE_ACCESS_LEVEL = 3;
const DOCUMENTS = [
  ['quote', 'Quote'],
  ['order', 'Order'],
  ['invoice', 'Invoice'],
  ['packing', 'Packing list'],
  ['shipping', 'Shipping label'],
];

export default function JobDocuments({ jobId, accessLevel, onMade }) {
  const [documents, setDocuments] = useState({});
  const [pendingType, setPendingType] = useState(null);
  const [error, setError] = useState({ type: null, message: '' });

  const load = useCallback(async () => {
    const result = await listDocuments(jobId);
    if (result.ok) setDocuments(result.data);
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  async function make(type) {
    setPendingType(type);
    setError({ type: null, message: '' });
    const result = await makeDocument(jobId, type);
    setPendingType(null);
    if (!result.ok) {
      setError({ type, message: result.error.message });
      return;
    }
    await load();
    onMade();
  }

  return (
    <section className="js-card">
      <div className="js-head"><h3>Documents</h3></div>
      <ul className="jd-list">
        {DOCUMENTS.map(([type, label]) => {
          const file = documents[type];
          return (
            <li key={type} className="jd-item">
              <strong>{label}</strong>
              {file && (
                <>
                  <small>{file.filename}</small>
                  <PrintActions fileId={file.id} filename={file.filename} kind={type} />
                </>
              )}
              {accessLevel >= MAKE_ACCESS_LEVEL && (
                <button type="button" onClick={() => make(type)} disabled={pendingType === type}>
                  {pendingType === type ? 'Making…' : 'Make PDF'}
                </button>
              )}
              {error.type === type && <span role="status">{error.message}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
