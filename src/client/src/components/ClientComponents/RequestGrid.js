import React from 'react';

// Mirrors REQUEST_EXTENSIONS in src/lib/quoteRequestFiles.js.
const ACCEPT = '.pdf,.step,.stp,.igs,.iges,.dxf,.dwg,.x_t,.sldprt,.png,.jpg,.jpeg';
const WARNING = 'Add one PDF drawing and one STEP file';
const TEXT_FIELDS = [
  ['part_number', 'Part number'],
  ['description', 'Description'],
  ['rev', 'Rev'],
  ['material', 'Material'],
  ['finish', 'Finish'],
];

let keyCounter = 0;

export const emptyRow = () => {
  keyCounter += 1;
  return {
    key: `row-${keyCounter}`,
    id: null,
    part_number: '',
    description: '',
    rev: '',
    material: '',
    finish: '',
    quantity: '',
    files: [],
    pending: [],
  };
};

export const emptyRows = (n) => Array.from({ length: n }, emptyRow);

const isBlankValue = (v) => v === null || v === undefined || String(v).trim() === '';

export const isRowEmpty = (row) =>
  [...TEXT_FIELDS.map(([name]) => row[name]), row.quantity].every(isBlankValue) &&
  row.files.length === 0 &&
  row.pending.length === 0;

const fileNames = (row) => [...row.files.map((f) => f.filename), ...row.pending.map((f) => f.name)];
const extOf = (name) => (name.lastIndexOf('.') < 0 ? '' : name.slice(name.lastIndexOf('.')).toLowerCase());

const hasPdfAndStep = (row) => {
  const exts = fileNames(row).map(extOf);
  return exts.filter((e) => e === '.pdf').length === 1 &&
    exts.filter((e) => e === '.step' || e === '.stp').length === 1;
};

export default function RequestGrid({ rows, onChange, errors = {}, readOnly = false }) {
  const updateRow = (key, patch) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addFiles = (row, fileList) =>
    updateRow(row.key, { pending: [...row.pending, ...Array.from(fileList)] });

  const removeSaved = (row, id) =>
    updateRow(row.key, { files: row.files.filter((f) => f.id !== id) });

  const removePending = (row, index) =>
    updateRow(row.key, { pending: row.pending.filter((_, i) => i !== index) });

  const renderRow = (row) => {
    const warn = !isRowEmpty(row) && !hasPdfAndStep(row);
    const error = errors[row.key];
    const idFor = (name) => `${row.key}-${name}`;

    if (readOnly) {
      return (
        <div className="portal-request-row" key={row.key}>
          <div className="portal-request-cell portal-request-cell-files">
            <span className="portal-request-label">Files</span>
            <ul className="portal-request-files">
              {fileNames(row).map((name) => <li key={name}>{name}</li>)}
            </ul>
          </div>
          {TEXT_FIELDS.map(([name, label]) => (
            <div className="portal-request-cell" key={name}>
              <span className="portal-request-label">{label}</span>
              <span>{row[name]}</span>
            </div>
          ))}
          <div className="portal-request-cell">
            <span className="portal-request-label">Quantity</span>
            <span>{row.quantity}</span>
          </div>
          {error && <p className="portal-error" role="alert">{error}</p>}
        </div>
      );
    }

    return (
      <div className="portal-request-row" key={row.key}>
        <div className="portal-request-cell portal-request-cell-files">
          <label className="portal-request-label" htmlFor={idFor('files')}>Files</label>
          <input
            id={idFor('files')}
            className="portal-input"
            type="file"
            multiple
            accept={ACCEPT}
            value=""
            onChange={(e) => addFiles(row, e.target.files)}
          />
          <ul className="portal-request-files">
            {row.files.map((f) => (
              <li key={`saved-${f.id}`}>
                {f.filename}{' '}
                <button type="button" className="portal-request-remove" aria-label={`Remove ${f.filename}`} onClick={() => removeSaved(row, f.id)}>Remove</button>
              </li>
            ))}
            {row.pending.map((f, i) => (
              <li key={`pending-${i}-${f.name}`}>
                {f.name}{' '}
                <button type="button" className="portal-request-remove" aria-label={`Remove ${f.name}`} onClick={() => removePending(row, i)}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
        {TEXT_FIELDS.map(([name, label]) => (
          <div className="portal-request-cell" key={name}>
            <label className="portal-request-label" htmlFor={idFor(name)}>{label}</label>
            <input
              id={idFor(name)}
              className="portal-input"
              type="text"
              value={row[name]}
              onChange={(e) => updateRow(row.key, { [name]: e.target.value })}
            />
          </div>
        ))}
        <div className="portal-request-cell">
          <label className="portal-request-label" htmlFor={idFor('quantity')}>Quantity *</label>
          <input
            id={idFor('quantity')}
            className="portal-input"
            type="number"
            min="1"
            required
            value={row.quantity}
            onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
          />
        </div>
        {warn && <p className="portal-request-warning">{WARNING}</p>}
        {error && <p className="portal-error" role="alert">{error}</p>}
      </div>
    );
  };

  return (
    <div className="portal-request-grid">
      <div className="portal-request-head" aria-hidden="true">
        {['Files', ...TEXT_FIELDS.map(([, l]) => l), 'Quantity'].map((l) => <span key={l}>{l}</span>)}
      </div>
      {rows.map(renderRow)}
      {!readOnly && (
        <button type="button" className="portal-button portal-request-add" onClick={() => onChange([...rows, emptyRow()])}>
          + Add row
        </button>
      )}
    </div>
  );
}
