import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PdfThumbnail } from '../PdfImage';
import { fetchAdminDrawingUrl } from '../../api/adminDrawing';
import { addJobNote } from '../../api/simpleJobsApi';
import { createQueue } from './drawingQueue';
import { TERMS, poLabel, invoiceLabel, money, formatDate, readClaims, SESSION_MESSAGE } from './simpleCard';

const drawingQueue = createQueue();

function Drawing({ fileId }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (fileId == null) return undefined;
    let isCurrent = true;
    let loaded = null;
    drawingQueue.run(() => fetchAdminDrawingUrl({ id: fileId })).then((result) => {
      if (!result.ok) return;
      loaded = result.url;
      if (isCurrent) setUrl(result.url);
      else URL.revokeObjectURL(result.url);
    });
    return () => {
      isCurrent = false;
      if (loaded) URL.revokeObjectURL(loaded);
    };
  }, [fileId]);

  return (
    <div className="sm-drawing">
      {url ? <PdfThumbnail previewUrl={url} /> : <span>{TERMS.drawing}</span>}
    </div>
  );
}

function NoteBox({ jobId, onAdded }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    const claims = readClaims(localStorage.getItem('token'));
    if (!claims?.id) {
      setError(SESSION_MESSAGE);
      return;
    }
    const result = await addJobNote(jobId, claims.id, content);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setText('');
    onAdded();
  };

  return (
    <form className="sm-note-form" onSubmit={submit}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      {error && <p className="sm-error">{error}</p>}
      <button type="submit">{TERMS.addNote}</button>
    </form>
  );
}

export default function SimpleJobCard({ job, onReload, actions }) {
  return (
    <section className="sm-card">
      <header>
        <Link className="sm-number" to={`/job/${job.id}`}>{job.job_number}</Link>
        <span>{TERMS.company} {job.company}</span>
        <span>{TERMS.attention} {job.attention}</span>
        <span>{formatDate(job.created_at)}</span>
        <span className="sm-tag">{poLabel(job)}</span>
        <span className="sm-tag">{invoiceLabel(job)}</span>
        {actions}
      </header>
      {job.parts.map((part) => (
        <div className="sm-part" key={`${part.part_id}-${part.rev}-${part.quantity}`}>
          <Link to={`/part/${part.part_id}`}><Drawing fileId={part.drawing_file_id} /></Link>
          <div className="sm-facts">
            <b>{part.number}</b> <span>Rev {part.rev}</span>
            <p>{part.description}</p>
            <p>{part.material}</p>
            <p>{TERMS.quantity} {part.quantity} · {TERMS.unitPrice} {money(part.price)} · {money(part.line_total)}</p>
          </div>
        </div>
      ))}
      <p className="sm-total">{TERMS.total} {money(job.total)}</p>
      <div className="sm-notes">
        <h3>{TERMS.notes}</h3>
        {job.notes.map((note, i) => (
          <p key={i}><b>{note.author}</b> {formatDate(note.created_at)} {note.content}</p>
        ))}
        <NoteBox jobId={job.id} onAdded={onReload} />
      </div>
    </section>
  );
}
