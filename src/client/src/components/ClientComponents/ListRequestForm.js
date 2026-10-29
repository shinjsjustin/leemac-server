import React, { useEffect, useState } from 'react';
import { getRequestLines, requestFromList } from '../../api/portalListsApi';
import PortalMessage from './PortalMessage';

const NO_QUANTITY_MESSAGE = 'Add a quantity to at least one part.';
const TEXT_FIELDS = [
  ['description', 'Description'],
  ['rev', 'Rev'],
  ['material', 'Material'],
  ['finish', 'Finish'],
];

const toRow = (line) => ({
  part_id: line.part_id,
  part_number: line.part_number,
  drawings: line.drawings,
  description: line.description ?? '',
  rev: line.rev ?? '',
  material: line.material ?? '',
  finish: line.finish ?? '',
  quantity: '',
});

const toLine = ({ part_id, quantity, description, rev, material, finish }) =>
  ({ part_id, quantity: Number(quantity), description, rev, material, finish });

const ListRequestForm = ({ list, onCancel, onSubmitted, onGone }) => {
  const [rows, setRows] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    getRequestLines(list.id).then((res) => {
      if (!isCurrent) return;
      if (res.ok) setRows(res.data.map(toRow));
      else setLoadError(res.error);
    });
    return () => { isCurrent = false; };
  }, [list.id]);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  if (loadError) {
    const kind = loadError.kind === 'invalid' ? 'error' : loadError.kind;
    return <PortalMessage kind={kind} message={loadError.message} />;
  }
  if (!rows) return <PortalMessage kind="loading" />;

  const update = (partId, key, value) =>
    setRows(rows.map((row) => (row.part_id === partId ? { ...row, [key]: value } : row)));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const lines = rows.filter((row) => row.quantity !== '').map(toLine);
    if (!lines.length) { setSubmitError(NO_QUANTITY_MESSAGE); return; }
    setSubmitError('');
    setIsBusy(true);
    const res = await requestFromList(list.id, { name: list.name, lines });
    setIsBusy(false);
    if (res.ok) onSubmitted(res.data);
    else if (res.error.kind === 'not_found') onGone();
    else setSubmitError(res.error.message);
  };

  return (
    <form className="portal-form" onSubmit={handleSubmit}>
      {rows.map((row) => (
        <div key={row.part_id} className="portal-list-request-row">
          <strong>{row.part_number}</strong>
          {row.drawings.length > 0 && (
            <div>
              <span className="portal-field-label">Drawings on file</span>
              <ul>{row.drawings.map((d) => <li key={d.id}>{d.filename}</li>)}</ul>
            </div>
          )}
          {TEXT_FIELDS.map(([key, label]) => (
            <label key={key} className="portal-label">{label}
              <input className="portal-input" type="text" value={row[key]}
                     onChange={(e) => update(row.part_id, key, e.target.value)} />
            </label>
          ))}
          <label className="portal-label">Quantity
            <input className="portal-input" type="number" min="1" value={row.quantity}
                   onChange={(e) => update(row.part_id, 'quantity', e.target.value)} />
          </label>
        </div>
      ))}
      {submitError && <p className="portal-error" role="alert">{submitError}</p>}
      <div className="portal-list-request-footer">
        <button type="submit" className="portal-button" disabled={isBusy}>Submit</button>
        <button type="button" className="portal-button portal-button--quiet" onClick={onCancel}>Cancel</button>
        <span>escape to cancel</span>
      </div>
    </form>
  );
};

export default ListRequestForm;
