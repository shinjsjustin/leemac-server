import React, { useEffect, useState } from 'react';
import { getDocumentForm, refillDocument, saveDocument } from '../../api/jobDocumentsApi';
import './jobHeader.css';
import './documentEditor.css';

const EMPTY_PART = { number: '', rev: '', description: '', details: '', quantity: '', price: '' };
const PART_COLUMNS = [
  ['number', 'Number'], ['rev', 'Rev'], ['description', 'Description'],
  ['details', 'Details'], ['quantity', 'Quantity'], ['price', 'Price'],
];

// [label, path into fields] for the plain text inputs, in display order.
const TEXT_FIELDS = [
  ['Customer name', ['customer', 'name']],
  ['Line 1', ['customer', 'line1']],
  ['Line 2', ['customer', 'line2']],
  ['Attention', ['customer', 'attention']],
  ['Reference', ['reference']],
  ['Created date', ['dates', 'created']],
  ['PO date', ['dates', 'po']],
  ['Due date', ['dates', 'due']],
  ['Invoice date', ['dates', 'invoice']],
  ['Ship date', ['dates', 'ship']],
  ['PO number', ['poNumber']],
];
const INVOICE_NUMBER_FIELD = ['Invoice number', ['invoiceNumber']];

const LEADTIME_FIELD = ['Leadtime', ['leadtime']];
const LEADTIME_TYPES = ['quote', 'order'];

const getAt = (obj, path) => path.reduce((value, key) => value?.[key], obj);

// Returns a copy of obj with the value at path replaced.
const setAt = (obj, [key, ...rest], value) => ({
  ...obj,
  [key]: rest.length ? setAt(obj[key], rest, value) : value,
});

function TextField({ label, path, fields, onChange, type = 'text' }) {
  return (
    <label className="jh-field">
      {label}
      <input type={type} value={getAt(fields, path) ?? ''} onChange={(e) => onChange(path, e.target.value)} />
    </label>
  );
}

export default function DocumentEditor({ jobId, type, label, onSaved, onClose }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await getDocumentForm(jobId, type);
      if (result.ok) setDoc(result.data);
      else setError(result.error.message);
    })();
  }, [jobId, type]);

  const setField = (path, value) =>
    setDoc((prev) => ({ ...prev, fields: setAt(prev.fields, path, value) }));
  const setPart = (index, key, value) =>
    setDoc((prev) => ({
      ...prev,
      parts: prev.parts.map((part, i) => (i === index ? { ...part, [key]: value } : part)),
    }));
  const addPart = () => setDoc((prev) => ({ ...prev, parts: [...prev.parts, EMPTY_PART] }));
  const removePart = (index) =>
    setDoc((prev) => ({ ...prev, parts: prev.parts.filter((_, i) => i !== index) }));

  async function refill() {
    setError('');
    const result = await refillDocument(jobId, type);
    if (result.ok) setDoc(result.data);
    else setError(result.error.message);
  }

  async function save() {
    setIsSaving(true);
    setError('');
    const result = await saveDocument(jobId, type, { fields: doc.fields, parts: doc.parts });
    setIsSaving(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onSaved();
  }

  const textFields = [
    ...TEXT_FIELDS,
    ...(type === 'invoice' ? [INVOICE_NUMBER_FIELD] : []),
    ...(LEADTIME_TYPES.includes(type) ? [LEADTIME_FIELD] : []),
  ];

  return (
    <div className="jh-overlay" onClick={onClose}>
      <div className="jh-modal de-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jh-close" onClick={onClose} aria-label="Close">×</button>
        <h3>Edit {label}</h3>
        {doc && (
          <>
            <p className="de-saved">
              {doc.saved ? `Saved ${new Date(doc.savedAt).toLocaleString()}` : 'Not saved yet'}
            </p>
            <div className="jh-form de-grid">
              {textFields.map(([text, path]) => (
                <TextField key={text} label={text} path={path} fields={doc.fields} onChange={setField} />
              ))}
              <label className="jh-field">
                Tax
                <input
                  type="checkbox"
                  checked={doc.fields.tax.flag === 'Y'}
                  onChange={(e) => setField(['tax', 'flag'], e.target.checked ? 'Y' : 'N')}
                />
              </label>
              <TextField label="Tax percent" path={['tax', 'percent']} fields={doc.fields} onChange={setField} />
              <TextField label="Tax amount" path={['tax', 'amount']} fields={doc.fields} onChange={setField} />
            </div>
            <table className="de-parts">
              <thead>
                <tr>{PART_COLUMNS.map(([key, text]) => <th key={key}>{text}</th>)}<th /></tr>
              </thead>
              <tbody>
                {doc.parts.map((part, index) => (
                  // Parts have no stable id and rows are only added or removed by index.
                  // eslint-disable-next-line react/no-array-index-key
                  <tr key={index}>
                    {PART_COLUMNS.map(([key, text]) => (
                      <td key={key}>
                        <input
                          aria-label={`Part ${index + 1} ${key}`}
                          value={part[key] ?? ''}
                          onChange={(e) => setPart(index, key, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <button type="button" aria-label={`Remove part ${index + 1}`} onClick={() => removePart(index)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" onClick={addPart}>Add part</button>
          </>
        )}
        {error && <p role="alert" className="de-error">{error}</p>}
        <div className="de-actions">
          <button type="button" onClick={refill} disabled={!doc}>Refill from job</button>
          <button type="button" className="jh-save" onClick={save} disabled={!doc || isSaving}>Save</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
