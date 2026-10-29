import React from 'react';
import { downloadFile } from '../../api/portalApi';

// Mirrors REQUEST_EXTENSIONS in src/lib/quoteRequestFiles.js.
const ACCEPT = '.pdf,.step,.stp,.igs,.iges,.dxf,.dwg,.x_t,.sldprt,.png,.jpg,.jpeg';
const WARNING = 'Add one PDF drawing and one STEP file';
const TEXT_FIELDS = [
  ['part_number', 'Part name'],
  ['description', 'Description'],
  ['rev', 'Rev'],
  ['material', 'Material'],
  ['finish', 'Finish'],
];

const HEAD_LABELS = ['Files', 'Part name / Description', 'Rev / Material / Finish', 'Quantity'];

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
    part_files: [],
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

    const textCell = (name, label) =>
      readOnly ? (
        <div key={name}>
          <span className="portal-request-label">{label}</span>
          <span>{row[name]}</span>
        </div>
      ) : (
        <div key={name}>
          <label className="portal-request-label" htmlFor={idFor(name)}>{label}</label>
          <input
            id={idFor(name)}
            className="portal-input"
            type="text"
            placeholder={label}
            value={row[name]}
            onChange={(e) => updateRow(row.key, { [name]: e.target.value })}
          />
        </div>
      );

    const fileItem = (key, name, onRemove) => (
      <li key={key}>
        {name}
        {!readOnly && (
          <>
            {' '}
            <button type="button" className="portal-request-remove" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
          </>
        )}
      </li>
    );

    return (
      <div className="portal-request-row" key={row.key}>
        <div className="portal-request-cell portal-request-cell-files">
          {!readOnly && (
            <label
              className="portal-request-drop"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(row, e.dataTransfer.files);
              }}
            >
              Click or drag files here
              <input
                hidden
                type="file"
                multiple
                accept={ACCEPT}
                value=""
                onChange={(e) => addFiles(row, e.target.files)}
              />
            </label>
          )}
          <ul className="portal-request-files">
            {row.files.map((f) => fileItem(`saved-${f.id}`, f.filename, () => removeSaved(row, f.id)))}
            {row.pending.map((f, i) => fileItem(`pending-${i}-${f.name}`, f.name, () => removePending(row, i)))}
          </ul>
          {row.part_files.length > 0 && (
            <>
              <span className="portal-request-label">On file</span>
              <ul className="portal-request-files">
                {row.part_files.map((f) => (
                  <li key={`part-${f.id}`}>
                    <button type="button" className="portal-button portal-button--quiet" onClick={() => downloadFile(f)}>
                      {f.filename}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="portal-request-cell">
          {textCell('part_number', 'Part name')}
          {textCell('description', 'Description')}
        </div>
        <div className="portal-request-cell">
          {textCell('rev', 'Rev')}
          {textCell('material', 'Material')}
          {textCell('finish', 'Finish')}
        </div>
        <div className="portal-request-cell">
          {readOnly ? (
            <>
              <span className="portal-request-label">Quantity</span>
              <span>{row.quantity}</span>
            </>
          ) : (
            <>
              <label className="portal-request-label" htmlFor={idFor('quantity')}>Quantity *</label>
              <input
                id={idFor('quantity')}
                className="portal-input"
                type="number"
                placeholder="Qty"
                min="1"
                required
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
              />
            </>
          )}
        </div>
        {warn && !readOnly && <p className="portal-request-warning">{WARNING}</p>}
        {error && <p className="portal-error" role="alert">{error}</p>}
      </div>
    );
  };

  return (
    <div className="portal-request-grid">
      <div className="portal-request-head" aria-hidden="true">
        {HEAD_LABELS.map((l) => <span key={l}>{l}</span>)}
      </div>
      {rows.map(renderRow)}
      {!readOnly && (
        <button type="button" className="portal-button portal-request-add" aria-label="Add row" onClick={() => onChange([...rows, emptyRow()])}>
          +
        </button>
      )}
    </div>
  );
}
