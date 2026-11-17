import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { openSharedQc, fetchSharedDrawingUrl, fetchSharedPhotoUrl } from '../../api/shareApi';
import PortalLayout from './PortalLayout';
import PortalMessage from './PortalMessage';
import QcDrawing from './QcDrawing';
import QcPhotos from './QcPhotos';
import { qcView } from './shareQcView';
import '../Styling/PortalShare.css';

export default function ShareQcPage() {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let isCurrent = true;
    openSharedQc(token).then((result) => {
      if (!isCurrent) return;
      if (!result.ok) {
        setState({ status: result.error.kind === 'not_found' ? 'not_found' : 'error' });
      } else {
        setState(result.data ? { status: 'ready', view: qcView(result.data) } : { status: 'not_found' });
      }
    });
    return () => { isCurrent = false; };
  }, [token]);

  // Stable, because QcPhotos refetches every photo when this changes.
  const fetchPhoto = useCallback((photoId) => fetchSharedPhotoUrl(token, photoId), [token]);
  const fetchDrawing = useCallback((drawing) => fetchSharedDrawingUrl(token, drawing.id), [token]);

  const scrollToPhotos = (marking) => {
    setSelectedId(marking.id);
    const target = document.getElementById(`qc-photos-${marking.id}`);
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  };

  const showOnDrawing = (markingId) => {
    setSelectedId(markingId);
    const target = document.getElementById('qc-drawings');
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  };

  const { status, view } = state;
  return (
    <PortalLayout wide title={view ? view.number : 'Part'} signedIn={false}>
      {status === 'loading' && <PortalMessage kind="loading" />}
      {status === 'error' && <PortalMessage kind="error" />}
      {status === 'not_found' && (
        <PortalMessage kind="not_found" heading="We couldn't find that part" message="The link may have expired or been turned off." />
      )}
      {status === 'ready' && (
        <>
          <p className="portal-part-desc">{view.description}</p>
          <h2 className="portal-section-title">Drawings</h2>
          <div id="qc-drawings" className="portal-drawings portal-drawings--large">
            {view.drawings.map((file) => (
              <QcDrawing
                key={file.id}
                file={file}
                markings={view.markings}
                selectedId={selectedId}
                onSelect={scrollToPhotos}
                readOnly
                fetchUrl={fetchDrawing}
              />
            ))}
          </div>
          {view.photos[0].photos.length > 0 && (
            <>
              <h2 className="portal-section-title">QC photos</h2>
              <QcPhotos
                jobs={view.photos}
                markings={view.markings}
                selectedId={selectedId}
                onShowOnDrawing={showOnDrawing}
                fetchUrl={fetchPhoto}
              />
            </>
          )}
        </>
      )}
      <Link className="portal-button portal-button--quiet" to="/client-login">Log in</Link>
    </PortalLayout>
  );
}
