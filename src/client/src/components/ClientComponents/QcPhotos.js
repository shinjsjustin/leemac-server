import React, { useEffect, useState } from 'react';
import { fetchPhotoUrl } from '../../api/qcApi';
import { formatDate } from '../../api/portalApi';
import '../Styling/PortalQc.css';

// Numbers match the drawing: a marking's place among the markings of its own file and page.
const markingNumber = (markings, marking) => (
  markings.filter((m) => m.file_id === marking.file_id && m.page === marking.page).indexOf(marking) + 1
);

const byMarking = (photos) => {
  const groups = new Map();
  photos.forEach((photo) => {
    groups.set(photo.marking_id, [...(groups.get(photo.marking_id) || []), photo]);
  });
  return [...groups.entries()];
};

function usePhotoUrls(jobs) {
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let isCurrent = true;
    const loaded = [];
    jobs.flatMap((job) => job.photos).forEach((photo) => {
      fetchPhotoUrl(photo.id).then((result) => {
        if (!result.ok) return;
        if (!isCurrent) {
          URL.revokeObjectURL(result.url);
          return;
        }
        loaded.push(result.url);
        setUrls((current) => ({ ...current, [photo.id]: result.url }));
      });
    });
    return () => {
      isCurrent = false;
      loaded.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [jobs]);
  return urls;
}

function MarkingPhotos({ jobId, markingId, number, photos, urls, isSelected, onShowOnDrawing }) {
  const [mainId, setMainId] = useState(photos[0].id);
  const main = photos.find((photo) => photo.id === mainId) || photos[0];
  return (
    <div id={`qc-photos-${markingId}`} data-job={jobId} className={`portal-qc-photos-marking${isSelected ? ' is-selected' : ''}`}>
      <div className="portal-qc-photos-head">
        <b>Marking {number}</b>
        <span>{photos.length} {photos.length === 1 ? 'photo' : 'photos'}</span>
        <button type="button" onClick={() => onShowOnDrawing(markingId)}>Show on drawing</button>
      </div>
      {main.caption && <p>{main.caption}</p>}
      <div className="portal-qc-photos-main">
        {urls[main.id] && <img src={urls[main.id]} alt={main.caption || `Marking ${number} photo`} />}
      </div>
      <div className="portal-qc-photos-thumbs">
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            className={`portal-qc-photos-thumb${photo.id === main.id ? ' is-active' : ''}`}
            onClick={() => setMainId(photo.id)}
          >
            {urls[photo.id] && <img src={urls[photo.id]} alt="" />}
            <span>{photo.value}</span>
            <small>{photo.caption}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function QcPhotos({ jobs, markings, selectedId, onShowOnDrawing }) {
  const urls = usePhotoUrls(jobs);
  return (
    <div className="portal-qc-photos">
      {jobs.map((job) => (
        <section key={job.job_id} className="portal-qc-photos-job">
          <h3>
            {job.job_number}
            {job.ship_date ? ` · Shipped ${formatDate(job.ship_date)}` : ''}
            {` · Qty ${job.quantity}`}
            {job.po_number ? ` · PO ${job.po_number}` : ''}
          </h3>
          {byMarking(job.photos).map(([markingId, photos]) => {
            const marking = markings.find((m) => m.id === markingId);
            return (
              <MarkingPhotos
                key={markingId}
                jobId={job.job_id}
                markingId={markingId}
                number={marking ? markingNumber(markings, marking) : ''}
                photos={photos}
                urls={urls}
                isSelected={markingId === selectedId}
                onShowOnDrawing={onShowOnDrawing}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}
