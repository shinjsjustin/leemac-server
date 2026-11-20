import React, { useEffect, useState } from 'react';
import { Thread } from './NotePin';
import { addNote } from '../../api/portalNotesApi';
import '../Styling/PortalNoteForm.css';

const MAX_NOTE_LENGTH = 255;

export default function JobNoteForm({ jobId, jobNumber, notes, onNoteAdded, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const submit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    const result = await addNote({ job_id: jobId }, text);
    setIsSaving(false);
    if (!result.ok) return setError(result.error.message);
    await onNoteAdded?.();
    return onClose();
  };

  return (
    <>
      <div className="portal-note-form-backdrop" onClick={onClose} />
      <form className="portal-note-form" role="dialog" aria-label={`Notes on ${jobNumber}`} onSubmit={submit}>
        <h3 className="portal-note-form-title">Notes on {jobNumber}</h3>
        <Thread notes={notes} allowReply={false} />
        <textarea
          value={text}
          maxLength={MAX_NOTE_LENGTH}
          onChange={(event) => setText(event.target.value)}
          placeholder={'Add a note for Leemac…'}
          aria-label="Your note"
          autoFocus
        />
        {error && <p className="portal-pin-error" role="alert">{error}</p>}
        <div className="portal-note-form-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={!text.trim() || isSaving}>Save</button>
        </div>
      </form>
    </>
  );
}
