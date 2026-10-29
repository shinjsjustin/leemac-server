import React, { useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { apiFetch } from '../../api/apiFetch';

const timeText = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export default function PartNotes({ jobId, partId, notes = [], onChanged }) {
  const [isComposing, setIsComposing] = useState(false);
  const [content, setContent] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [error, setError] = useState(null);

  const send = async (path, options) => {
    setError(null);
    try {
      const res = await apiFetch(path, options);
      if (res.ok) return true;
    } catch {
      // fall through to the shared error message
    }
    setError('Could not save the note. Try again.');
    return false;
  };

  const toggleShare = async (note) => {
    const isOk = await send('/internal/notes/share', { method: 'PUT', body: { id: note.id, shared: !note.shared } });
    if (isOk) onChanged();
  };

  const save = async () => {
    if (!content.trim()) return;
    const token = localStorage.getItem('token');
    const userid = token ? jwtDecode(token).id : undefined;
    const isOk = await send('/internal/notes/newnote', {
      method: 'POST',
      body: { content, userid, jobid: jobId, partid: partId, shared: isShared },
    });
    if (!isOk) return;
    setIsComposing(false);
    setContent('');
    setIsShared(false);
    onChanged();
  };

  return (
    <>
      <button type="button" onClick={() => setIsComposing(true)}>+ Note</button>
      {error && <div role="alert" className="pnote-err">{error}</div>}
      <div className="pnotes">
        {isComposing && (
          <div className="pcompose">
            <textarea value={content} onChange={(e) => setContent(e.target.value)} />
            <div className="row">
              <button type="button" className={isShared ? '' : 'on'} onClick={() => setIsShared(false)}>Private</button>
              <button type="button" className={isShared ? 'on' : ''} onClick={() => setIsShared(true)}>Shared</button>
              <button type="button" onClick={save}>Save</button>
              <button type="button" onClick={() => setIsComposing(false)}>Cancel</button>
            </div>
          </div>
        )}
        {notes.map((note) => (
          <div key={note.id} className="pnote">
            <div className="meta">
              <span className={`tag ${note.shared ? 'sh' : 'pv'}`}>{note.shared ? 'SHARED' : 'PRIVATE'}</span>
              {note.author} · {timeText(note.created_at)}{note.is_client ? ' · from client' : ''}
            </div>
            <div>{note.content}</div>
            {!note.is_client && (
              <button type="button" onClick={() => toggleShare(note)}>{note.shared ? 'Unshare' : 'Share with client'}</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
