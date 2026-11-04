import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDroppedFiles, emptyPartRow, runBatch } from './addPartsBatch';
import * as partPoolApi from '../../api/partPoolApi';
import './partLists.css';
import './addParts.css';

// Mirrors ALLOWED_EXTENSIONS in src/lib/jobFiles.js, which the client bundle cannot import.
const ACCEPT = [
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.step', '.stp', '.igs', '.iges', '.dxf',
  '.dwg', '.x_t', '.sldprt', '.xlsx', '.xls', '.docx', '.doc', '.txt', '.csv',
].join(',');

const AddParts = () => {
  const [rows, setRows] = useState(() => [emptyPartRow()]);
  const [isOver, setIsOver] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const isBusy = progress !== null;

  const updateRow = (key, patch) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addFiles = (key, files) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, files: [...row.files, ...files] } : row)));

  const removeFile = (key, index) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, files: row.files.filter((_, i) => i !== index) } : row)));

  const handleDrop = (e) => {
    e.preventDefault();
    setIsOver(false);
    if (isBusy) return;
    const dropped = Array.from(e.dataTransfer.files);
    setRows((current) => addDroppedFiles(current, dropped));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    setProgress({ done: 0, total: rows.length });
    const outcome = await runBatch(rows, partPoolApi, (done, total) => setProgress({ done, total }));
    setRows(outcome.rows.length > 0 ? outcome.rows : [emptyPartRow()]);
    setResult(outcome);
    setProgress(null);
  };

  return (
      <form className="add-parts" onSubmit={handleSubmit}>
        <div
          className={`add-parts-drop${isOver ? ' is-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
          onDragLeave={() => setIsOver(false)}
          onDrop={handleDrop}
        >
          Drop files from Finder here. Files with the same name share a part.
        </div>
        <div className="add-parts-rows">
          {rows.map((row) => (
            <div key={row.key} className={`add-parts-row${row.error ? ' has-error' : ''}`}>
              <input
                type="text"
                aria-label="Part number"
                placeholder="Part number"
                value={row.number}
                disabled={isBusy}
                onChange={(e) => updateRow(row.key, { number: e.target.value })}
              />
              <input
                type="text"
                aria-label="Description"
                placeholder="Description"
                value={row.description}
                disabled={isBusy}
                onChange={(e) => updateRow(row.key, { description: e.target.value })}
              />
              <input
                type="file"
                aria-label="Add files"
                multiple
                accept={ACCEPT}
                disabled={isBusy}
                value=""
                onChange={(e) => addFiles(row.key, Array.from(e.target.files))}
              />
              <ul className="add-parts-files">
                {row.files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    {file.name}
                    <button type="button" className="add-parts-link" disabled={isBusy} onClick={() => removeFile(row.key, index)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {row.error && <p className="add-parts-error">{row.error}</p>}
            </div>
          ))}
        </div>
        <div className="add-parts-actions">
          <button type="button" className="add-parts-link" disabled={isBusy} onClick={() => setRows((current) => [...current, emptyPartRow()])}>
            Add row
          </button>
          <button type="submit" className="add-parts-button" disabled={isBusy}>Add parts</button>
          {isBusy && <span>Adding {progress.done} of {progress.total}...</span>}
        </div>
        {result && (
          <div className="add-parts-result">
            <p>{result.addedCount} {result.addedCount === 1 ? 'part' : 'parts'} added.</p>
            {result.messages.map((message) => <p key={message} className="add-parts-error">{message}</p>)}
            <Link to="/partlist">View the part list</Link>
          </div>
        )}
      </form>
  );
};

export default AddParts;
