import React from 'react';
import { downloadFile } from '../../api/portalApi';
import DrawingTile from './DrawingTile';
import { enqueueRequestFile } from './drawingQueue';
import '../Styling/PortalRequests.css';

// Mirrors REQUEST_EXTENSIONS in src/lib/quoteRequestFiles.js.
const ACCEPT = '.pdf,.step,.stp,.igs,.iges,.dxf,.dwg,.x_t,.sldprt,.png,.jpg,.jpeg';
const NO_PDF = 'Add one PDF file';
const NO_STEP = 'Add one STEP file';
const DROP_HINT = 'Drop a PDF and STEP here';
const DRAWING_WIDTH = 172;
const DRAWING_ASPECT = 400 / 260;
const TEXT_FIELDS = [
  ['part_number', 'Part name'],
  ['description', 'Description'],
  ['rev', 'Rev'],
  ['material', 'Material'],
  ['finish', 'Finish'],
];

// field is the row value that decides whether a read-only column is shown; null means always shown.
const COLUMNS = [
  { id: 'drawing', label: 'Drawing', width: '172px', field: null },
  { id: 'part', label: 'Part', width: 'minmax(0, 1.3fr)', field: null },
  { id: 'rev', label: 'Rev', width: '56px', field: 'rev' },
  { id: 'material', label: 'Material', width: 'minmax(0, 0.9fr)', field: 'material' },
  { id: 'finish', label: 'Finish', width: 'minmax(0, 1fr)', field: 'finish' },
  { id: 'qty', label: 'Qty', width: '90px', field: 'quantity' },
  { id: 'files', label: 'Files', width: 'minmax(0, 1fr)', field: null },
];

const visibleColumns = (rows, readOnly) =>
  readOnly ? COLUMNS.filter((c) => c.field === null || rows.some((r) => !isBlankValue(r[c.field]))) : COLUMNS;

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
    source_part_id: null,
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

const isPdf = (name) => extOf(name) === '.pdf';
const isStep = (name) => ['.step', '.stp'].includes(extOf(name));
const countKind = (row, test) => fileNames(row).filter(test).length;

const matchSentence = ({ part_number: number, rev, job_number: job, quantity }) => {
  const made = isBlankValue(job)
    ? ''
    : `, last made on job ${job}${isBlankValue(quantity) ? '' : ` (${quantity} pcs)`}`;
  return `Matches your part ${number}${isBlankValue(rev) ? '' : ` Rev ${rev}`}${made}`;
};

export default function RequestGrid({ rows, onChange, requestId, errors = {}, readOnly = false, matches = {}, onPartBlur }) {
  const columns = visibleColumns(rows, readOnly);
  const gridStyle = { '--portal-req-cols': columns.map((c) => c.width).join(' ') };

  const updateRow = (key, patch) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addFiles = (row, fileList) =>
    updateRow(row.key, { pending: [...row.pending, ...Array.from(fileList)] });

  const removeSaved = (row, id) =>
    updateRow(row.key, { files: row.files.filter((f) => f.id !== id) });

  const removePending = (row, index) =>
    updateRow(row.key, { pending: row.pending.filter((_, i) => i !== index) });

  const renderRow = (row) => {
    const isFilled = !isRowEmpty(row) && !readOnly;
    const needsPdf = isFilled && countKind(row, isPdf) !== 1;
    const needsStep = isFilled && countKind(row, isStep) !== 1;
    const needsQty = isFilled && isBlankValue(row.quantity);
    const partPdf = row.part_files.find((f) => isPdf(f.filename));
    const savedPdf = row.files.find((f) => isPdf(f.filename));
    const linePdf = fileNames(row).find(isPdf);
    const error = errors[row.key];
    const hasFiles = row.files.length > 0 || row.pending.length > 0;
    const hasBoth = countKind(row, isPdf) === 1 && countKind(row, isStep) === 1;
    const fileClass = readOnly ? undefined : hasBoth ? 'portal-req-file--ok' : 'portal-req-file--warn';
    const idFor = (name) => `${row.key}-${name}`;

    const fileItem = (key, name, onRemove) => (
      <li key={key} className={fileClass}>
        {name}
        {!readOnly && (
          <>
            {' '}
            <button type="button" className="portal-request-remove" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
          </>
        )}
      </li>
    );

    const textField = (name, label, className) =>
      readOnly && isBlankValue(row[name]) ? <div className={className} /> : readOnly ? (
        <div className={className}>
          <span className="portal-request-label">{label}</span>
          <span>{row[name]}</span>
        </div>
      ) : (
        <div className={className}>
          <label className="portal-request-label portal-visually-hidden" htmlFor={idFor(name)}>{label}</label>
          <input
            id={idFor(name)}
            className={`portal-input${name === 'part_number' ? ' portal-req-partno' : ''}`}
            type="text"
            placeholder={label}
            value={row[name]}
            onChange={(e) => updateRow(row.key, { [name]: e.target.value })}
            onBlur={name === 'part_number' && onPartBlur ? () => onPartBlur(row) : undefined}
          />
        </div>
      );

    const drawing = (() => {
      if (partPdf) return <DrawingTile file={partPdf} width={DRAWING_WIDTH} aspect={DRAWING_ASPECT} />;
      if (savedPdf && requestId) {
        return (
          <DrawingTile
            file={{ ...savedPdf, request_id: requestId }}
            width={DRAWING_WIDTH}
            aspect={DRAWING_ASPECT}
            enqueue={enqueueRequestFile}
          />
        );
      }
      if (row.pending.length > 0) {
        return <div className="portal-tile portal-tile--skeleton" style={{ aspectRatio: String(DRAWING_ASPECT) }} />;
      }
      const slotStyle = { aspectRatio: String(DRAWING_ASPECT) };
      if (readOnly) return <div className="portal-req-drophere" style={slotStyle}>{linePdf || DROP_HINT}</div>;
      return (
        <label
          className="portal-req-drophere"
          style={slotStyle}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(row, e.dataTransfer.files);
          }}
        >
          {linePdf || DROP_HINT}
          <input
            hidden
            type="file"
            multiple
            accept={ACCEPT}
            value=""
            onChange={(e) => addFiles(row, e.target.files)}
          />
        </label>
      );
    })();

    const cells = {
      drawing: (
        <div className="portal-req-drawing">
          {drawing}
        </div>
      ),
      part: (
        <div className="portal-req-part">
          {textField('part_number', 'Part name')}
          {textField('description', 'Description')}
          {row.source_part_id && <span className="portal-req-source">From your part {row.part_number}</span>}
          {matches[row.key] && <span className="portal-req-match">{matchSentence(matches[row.key])}</span>}
        </div>
      ),
      rev: textField('rev', 'Rev', 'portal-req-rev'),
      material: textField('material', 'Material', 'portal-req-material'),
      finish: textField('finish', 'Finish', 'portal-req-finish'),
      qty: (
        <div className="portal-req-qty">
          {readOnly && isBlankValue(row.quantity) ? null : readOnly ? (
            <>
              <span className="portal-request-label">Quantity</span>
              <span>{row.quantity}</span>
            </>
          ) : (
            <>
              <label className="portal-request-label portal-visually-hidden" htmlFor={idFor('quantity')}>Quantity *</label>
              <input
                id={idFor('quantity')}
                className={`portal-input${needsQty ? ' portal-req-field--warn' : ''}`}
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
      ),
      files: (
        <div className="portal-request-cell-files">
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
          {needsPdf && <p className="portal-req-warning">{NO_PDF}</p>}
          {needsStep && <p className="portal-req-warning">{NO_STEP}</p>}
        </div>
      ),
    };

    return (
      <div className="portal-request-row" key={row.key} style={gridStyle}>
        {columns.map((c) => <React.Fragment key={c.id}>{cells[c.id]}</React.Fragment>)}
        {error && <p className="portal-error" role="alert">{error}</p>}
      </div>
    );
  };

  return (
    <div className="portal-request-grid">
      <div className="portal-request-head" aria-hidden="true" style={gridStyle}>
        {columns.map((c) => <span key={c.id}>{c.label}</span>)}
      </div>
      {rows.map(renderRow)}
      {!readOnly && (
        <button type="button" className="portal-request-add" aria-label="Add row" onClick={() => onChange([...rows, emptyRow()])}>
          + Add line
        </button>
      )}
    </div>
  );
}
