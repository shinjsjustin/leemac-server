import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';
import PrintActions from '../PrintActions';
import DrawingTile from '../ClientComponents/DrawingTile';
import { enqueueJobFile, openJobPdf } from './jobFileQueue';
import './jobSide.css';
import './jobCards.css';

const PDF_TYPE = 'application/pdf';
const TILE_WIDTH = 300;
const TILE_ASPECT = 8.5 / 11;
const extension = (name) => (name.includes('.') ? name.split('.').pop().toUpperCase() : 'FILE');
const dateOnly = (value) => (value ? String(value).split('T')[0] : '');

export default function JobFiles({ jobId, refreshKey }) {
  const [files, setFiles] = useState([]);
  const inputRef = useRef(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await apiFetch(`/internal/job/files?jobId=${jobId}`);
      if (res.ok) setFiles(await res.json());
    } catch (e) {
      console.error('Error fetching job files:', e);
    }
  }, [jobId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles, refreshKey]);

  const saveFile = async (file) => {
    try {
      const res = await apiFetch(`/internal/part/blob/download?fileID=${file.id}`);
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

  const upload = async (e) => {
    const chosen = [...e.target.files];
    if (chosen.length === 0) return;
    try {
      const formData = new FormData();
      chosen.forEach((file) => formData.append('files', file));
      const res = await apiFetch(`/internal/job/uploadfile?id=${jobId}`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('File upload failed');
      fetchFiles();
    } catch (err) {
      console.error(err);
      alert('Failed to upload files.');
    }
  };

  return (
    <section className="js-card">
      <header className="js-head">
        <h3>Files <span>{files.length}</span></h3>
        <button type="button" onClick={() => inputRef.current.click()}>Upload</button>
        <input ref={inputRef} type="file" multiple hidden onChange={upload} />
      </header>
      <div className="jc-grid">
        {files.map((file) => (file.mimetype === PDF_TYPE ? (
          <div className="jc-card" key={file.id}>
            <DrawingTile file={file} width={TILE_WIDTH} aspect={TILE_ASPECT} enqueue={enqueueJobFile} onOpen={openJobPdf} />
            <span className="jc-name">{file.filename}</span>
            <small>{dateOnly(file.uploaded_at)}</small>
            <div className="jc-actions">
              <PrintActions fileId={file.id} filename={file.filename} kind="file" />
            </div>
          </div>
        ) : (
          <div className="jc-card" key={file.id}>
            <span className="jc-type">{extension(file.filename)}</span>
            <span className="jc-name">{file.filename}</span>
            <small>{dateOnly(file.uploaded_at)}</small>
            <div className="jc-actions">
              <button type="button" onClick={() => saveFile(file)}>Download</button>
            </div>
          </div>
        )))}
      </div>
    </section>
  );
}
