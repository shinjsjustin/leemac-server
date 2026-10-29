import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';
import './jobSide.css';

const GSCRIPT_URL = process.env.REACT_APP_GSCRIPT_URL;
const TABS = [['All', () => true], ['Private', (n) => !n.shared], ['Shared', (n) => !!n.shared]];

export default function JobNotes({ jobId, userId }) {
  const [notes, setNotes] = useState([]);
  const [tab, setTab] = useState('All');
  const [draft, setDraft] = useState('');
  const [shared, setShared] = useState(false);
  const [attached, setAttached] = useState([]);
  const inputRef = useRef(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await apiFetch(`/internal/notes/getnote?jobid=${jobId}`);
      const data = await res.json();
      if (res.status !== 200) return console.error(data);
      setNotes(await Promise.all(data.map(async (note) => {
        const fileRes = await apiFetch(`/internal/notes/getblob?noteID=${note.id}`);
        const files = fileRes.ok ? await fileRes.json() : [];
        return { ...note, files: files.map((f) => ({ ...f, fileID: f.id })) };
      })));
    } catch (e) {
      console.error(e);
    }
  }, [jobId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const postToScript = async (content) => {
    let attention = null;
    let jobNumber = null;
    try {
      const res = await apiFetch(`/internal/job/jobsummary?id=${jobId}`);
      const data = await res.json();
      if (res.status === 200 && data.job) {
        attention = data.job.attention;
        jobNumber = data.job.job_number;
      }
    } catch (e) {
      console.error('Error fetching job summary:', e);
    }
    try {
      await fetch(GSCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ note: { content, attention, job: jobNumber } }),
      });
    } catch (e) {
      console.error('Google Scripts API error:', e);
    }
  };

  const addNote = async () => {
    if (!draft.trim()) return alert('Note content cannot be empty.');
    try {
      const res = await apiFetch('/internal/notes/newnote', {
        method: 'POST',
        body: { content: draft, userid: userId, jobid: jobId, shared },
      });
      const data = await res.json();
      if (res.status !== 201) {
        console.error(data);
        return alert('Failed to add note.');
      }
      await postToScript(draft);
      if (attached.length > 0) {
        const formData = new FormData();
        attached.forEach((file) => formData.append('files', file));
        const fileRes = await apiFetch(`/internal/notes/uploadblob?id=${data.id}`, { method: 'POST', body: formData });
        if (!fileRes.ok) throw new Error('File upload failed');
      }
      setDraft('');
      setAttached([]);
      fetchNotes();
    } catch (e) {
      console.error(e);
      alert('Error occurred while adding note.');
    }
  };

  const toggleShare = async (note) => {
    try {
      const res = await apiFetch('/internal/notes/share', { method: 'PUT', body: { id: note.id, shared: !note.shared } });
      if (res.status !== 200) {
        console.error(await res.json());
        return alert('Failed to update note sharing.');
      }
      fetchNotes();
    } catch (e) {
      console.error(e);
      alert('Error occurred while updating note sharing.');
    }
  };

  const deleteNote = async (id) => {
    try {
      const res = await apiFetch('/internal/notes/delete', { method: 'DELETE', body: { id } });
      if (res.status !== 200) {
        console.error(await res.json());
        return alert('Failed to delete note.');
      }
      fetchNotes();
    } catch (e) {
      console.error(e);
      alert('Error occurred while deleting note.');
    }
  };

  const downloadFile = async (file) => {
    try {
      const res = await apiFetch(`/internal/part/blob/download?fileID=${file.fileID}`);
      if (!res.ok) throw new Error('Failed to download file');
      const url = window.URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error downloading file:', e);
      alert('Failed to download file. Please try again.');
    }
  };

  const drop = (e) => {
    e.preventDefault();
    setAttached((prev) => [...prev, ...e.dataTransfer.files]);
  };

  const visible = notes.filter(TABS.find(([name]) => name === tab)[1]);

  return (
    <section className="js-card">
      <header className="js-head">
        <h3>Notes</h3>
        <div className="js-tabs">
          {TABS.map(([name, test]) => (
            <button type="button" key={name} className={name === tab ? 'on' : ''} onClick={() => setTab(name)}>
              {`${name} ${notes.filter(test).length}`}
            </button>
          ))}
        </div>
      </header>
      <div className="jn-list">
        {visible.map((note) => (
          <div className="jn-note" key={note.id}>
            <span className={`jn-vis ${note.shared ? 'shared' : 'priv'}`}>{note.shared ? 'SHARED' : 'PRIVATE'}</span>
            <span>{note.part_number && <b className="jn-part">{note.part_number} </b>}{note.content}</span>
            <small>{note.author}{note.is_client ? ' (client)' : ''} · {new Date(note.created_at).toLocaleString()}</small>
            <div className="jn-actions">
              {!note.is_client && (
                <button type="button" className="jn-toggle" onClick={() => toggleShare(note)}>{note.shared ? 'Unshare' : 'Share'}</button>
              )}
              <button type="button" className="danger" onClick={() => deleteNote(note.id)}>Delete</button>
            </div>
            {note.files.map((file) => (
              <button type="button" key={file.id} className="jn-file" onClick={() => downloadFile(file)}>{file.filename}</button>
            ))}
          </div>
        ))}
      </div>
      <div className="jn-compose" onDrop={drop} onDragOver={(e) => e.preventDefault()}>
        <textarea placeholder="Add a note" value={draft} onChange={(e) => setDraft(e.target.value)} />
        {attached.length > 0 && (
          <ul className="jn-attached">
            {attached.map((file, i) => (
              <li key={`${file.name}-${i}`}>{file.name}
                <button type="button" onClick={() => setAttached((prev) => prev.filter((_, j) => j !== i))}>x</button>
              </li>
            ))}
          </ul>
        )}
        <div className="jn-row">
          <label><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with client</label>
          <button type="button" onClick={() => inputRef.current.click()}>Attach</button>
          <input ref={inputRef} type="file" multiple hidden onChange={(e) => setAttached((prev) => [...prev, ...e.target.files])} />
          <button type="button" className="primary" onClick={addNote}>Add note</button>
        </div>
      </div>
    </section>
  );
}
