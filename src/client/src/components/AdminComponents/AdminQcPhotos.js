import { useEffect, useRef, useState } from 'react';
import { deletePhoto, fetchAdminPhotoUrl, reorderPhotos, updatePhoto, uploadPhoto } from '../../api/qcAdminApi';
import { defaultJobId, fitWithin, jobsFor, moveId, photosByMarking } from './qcPhotoTray';

const JPEG_TYPE = 'image/jpeg';
const JPEG_QUALITY = 0.85;

export const cardId = (markingId) => `admin-qc-card-${markingId}`;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

async function shrinkToJpeg(file) {
  const img = await loadImage(file);
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, JPEG_TYPE, JPEG_QUALITY));
  if (!blob) throw new Error('Could not shrink that image.');
  return new File([blob], 'photo.jpg', { type: JPEG_TYPE });
}

function PhotoTile({ photo, index, count, canEdit, onMove, onChanged, onError }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let made = null;
    let cancelled = false;
    fetchAdminPhotoUrl(photo.id).then((result) => {
      if (!result.ok) return;
      if (cancelled) URL.revokeObjectURL(result.url);
      else { made = result.url; setUrl(result.url); }
    });
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made); };
  }, [photo.id]);

  const save = async (field, value) => {
    if (value === (photo[field] || '')) return;
    const result = await updatePhoto(photo.id, { [field]: value });
    if (result.ok) onChanged(); else onError(result.error.message);
  };
  const remove = async () => {
    if (!window.confirm('Delete this photo?')) return;
    const result = await deletePhoto(photo.id);
    if (result.ok) onChanged(); else onError(result.error.message);
  };

  return (
    <div className="admin-qc-tile">
      {index === 0 && <span className="admin-qc-main">main</span>}
      {url && <img src={url} alt={photo.caption || 'QC photo'} />}
      <small>Job {photo.job_number}</small>
      {canEdit ? (
        <>
          <input defaultValue={photo.value || ''} placeholder="Value" maxLength={64}
            onBlur={(e) => save('value', e.target.value)} />
          <input defaultValue={photo.caption || ''} placeholder="Caption" maxLength={255}
            onBlur={(e) => save('caption', e.target.value)} />
          <div className="admin-qc-tile-actions">
            <button type="button" aria-label="Move left" disabled={index === 0} onClick={() => onMove(photo.id, 'left')}>&larr;</button>
            <button type="button" aria-label="Move right" disabled={index === count - 1} onClick={() => onMove(photo.id, 'right')}>&rarr;</button>
            <button type="button" onClick={remove}>Delete</button>
          </div>
        </>
      ) : (
        <>
          {photo.value && <span>{photo.value}</span>}
          {photo.caption && <span>{photo.caption}</span>}
        </>
      )}
    </div>
  );
}

function MarkingCard({ marking, number, jobs, photos, canEdit, onShow, onChanged }) {
  const allowed = jobsFor(marking, jobs);
  const [jobId, setJobId] = useState(defaultJobId(marking, jobs));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const upload = async (files) => {
    setError('');
    setBusy(true);
    try {
      for (const file of files) {
        const result = await uploadPhoto(marking.id, { job_id: jobId }, await shrinkToJpeg(file));
        if (!result.ok) { setError(result.error.message); break; }
      }
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
    onChanged();
  };
  const move = async (id, direction) => {
    const result = await reorderPhotos(marking.id, moveId(photos.map((p) => p.id), id, direction));
    if (result.ok) onChanged(); else setError(result.error.message);
  };

  return (
    <div className="admin-qc-photo-card" id={cardId(marking.id)}>
      <div className="admin-qc-photo-head">
        <strong>{number}</strong>
        <span className={marking.company_id === null ? 'admin-qc-tag admin-qc-tag--leemac' : 'admin-qc-tag'}>
          {marking.company_id === null ? 'Leemac' : marking.company_name}
        </span>
        <button type="button" onClick={() => onShow(marking.id)}>Show on drawing</button>
      </div>
      {marking.note && <p>{marking.note}</p>}
      {canEdit && (
        <>
          <select value={jobId ?? ''} onChange={(e) => setJobId(Number(e.target.value))} aria-label="Job">
            {allowed.map((j) => <option key={j.id} value={j.id}>Job {j.job_number}</option>)}
          </select>
          <div className="admin-qc-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (jobId !== null && !busy) upload([...e.dataTransfer.files]); }}>
            <button type="button" disabled={jobId === null || busy} onClick={() => input.current.click()}>
              {busy ? 'Uploading...' : 'Drop photos here or browse'}
            </button>
            <input ref={input} type="file" accept="image/*" multiple hidden
              onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
          </div>
        </>
      )}
      {error && <p className="admin-qc-error" role="alert">{error}</p>}
      <div className="admin-qc-tiles">
        {photos.map((photo, index) => (
          <PhotoTile key={photo.id} photo={photo} index={index} count={photos.length} canEdit={canEdit}
            onMove={move} onChanged={onChanged} onError={setError} />
        ))}
      </div>
    </div>
  );
}

export default function AdminQcPhotos({ markings, photos, jobs, canEdit, onShow, onChanged }) {
  const byMarking = photosByMarking(photos);
  const pageIndex = (m) => markings.filter((x) => x.page === m.page).indexOf(m) + 1;
  if (markings.length === 0) return null;
  return (
    <div className="admin-qc-photos">
      <h3>QC photos</h3>
      {markings.map((m) => (
        <MarkingCard key={m.id} marking={m} number={pageIndex(m)} jobs={jobs} photos={byMarking[m.id] || []}
          canEdit={canEdit} onShow={onShow} onChanged={onChanged} />
      ))}
    </div>
  );
}
