import React, { useCallback, useEffect, useState } from 'react';
import { listDocuments, makeDocument } from '../../api/jobDocumentsApi';
import DocumentEditor from './DocumentEditor';
import PrintActions from '../PrintActions';
import DrawingTile from '../ClientComponents/DrawingTile';
import { enqueueJobFile, openJobPdf } from './jobFileQueue';
import './jobSide.css';
import './jobCards.css';

const MAKE_ACCESS_LEVEL = 3;
const TILE_WIDTH = 300;
const TILE_ASPECT = 8.5 / 11;
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
  const [listError, setListError] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    const result = await listDocuments(jobId);
    if (result.ok) {
      setDocuments(result.data);
      setListError('');
    } else {
      setListError(result.error.message);
    }
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

  async function handleSaved() {
    setEditing(null);
    await load();
    onMade();
  }

  return (
    <section className="js-card">
      <div className="js-head"><h3>Documents</h3></div>
      {listError && <span role="status" className="jc-error">{listError}</span>}
      <div className="jc-grid">
        {DOCUMENTS.map(([type, label]) => {
          const file = documents[type];
          const canMake = accessLevel >= MAKE_ACCESS_LEVEL;
          const editButton = canMake && (
            <button type="button" onClick={() => setEditing([type, label])}>Edit</button>
          );
          const makeButton = canMake && (
            <button type="button" onClick={() => make(type)} disabled={pendingType === type}>
              {pendingType === type ? 'Making…' : 'Make PDF'}
            </button>
          );
          const errorStatus = error.type === type && <span role="status" className="jc-error">{error.message}</span>;
          if (!file) {
            return (
              <div key={type} className="jc-placeholder">
                {label}
                {canMake && <div className="jc-actions">{editButton}{makeButton}</div>}
                {errorStatus}
              </div>
            );
          }
          return (
            <div key={type} className="jc-card">
              <DrawingTile
                key={file.id}
                file={file}
                width={TILE_WIDTH}
                aspect={TILE_ASPECT}
                enqueue={enqueueJobFile}
                onOpen={openJobPdf}
              />
              <span className="jc-name">{label}</span>
              <small>{file.filename}</small>
              <div className="jc-actions">
                {editButton}
                {makeButton}
                <PrintActions fileId={file.id} filename={file.filename} kind={type} />
              </div>
              {errorStatus}
            </div>
          );
        })}
      </div>
      {editing && (
        <DocumentEditor
          jobId={jobId}
          type={editing[0]}
          label={editing[1]}
          onSaved={handleSaved}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
