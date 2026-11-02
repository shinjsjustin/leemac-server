import React, { useEffect, useState } from 'react';
import { usePdfPageImages } from '../PdfImage';
import { fetchDrawingUrl } from '../../api/portalApi';
import { trimDataUrl } from './drawingTrim';

const RENDER_WIDTH = { small: 300, landscape: 600, large: 900 };

const EmptyBox = ({ size, children }) => (
  <div className={`portal-drawing-empty portal-drawing--${size}`}>{children}</div>
);

export const NoDrawing = ({ size = 'small' }) => <EmptyBox size={size}>No drawing</EmptyBox>;

export default function PortalDrawing({ file, size = 'small', fetchUrl = fetchDrawingUrl }) {
  const [url, setUrl] = useState(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const { images, failed } = usePdfPageImages(url, RENDER_WIDTH[size], true);
  const [trimmed, setTrimmed] = useState(null);

  useEffect(() => {
    if (!images[0]) return undefined;
    let isCurrent = true;
    const source = images[0];
    trimDataUrl(source).then(
      (result) => { if (isCurrent) setTrimmed({ source, result }); },
      () => {},
    );
    return () => { isCurrent = false; };
  }, [images[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let isCurrent = true;
    let loadedUrl = null;
    fetchUrl(file).then((result) => {
      if (!result.ok) {
        if (isCurrent) setFetchFailed(true);
        return;
      }
      if (!isCurrent) {
        URL.revokeObjectURL(result.url);
        return;
      }
      loadedUrl = result.url;
      setUrl(result.url);
    });
    return () => {
      isCurrent = false;
      if (loadedUrl) URL.revokeObjectURL(loadedUrl);
    };
    // The file is fetched once per mount, as the brief specifies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (fetchFailed || failed) return <EmptyBox size={size}>Drawing unavailable</EmptyBox>;
  if (!images[0]) return <EmptyBox size={size}>Loading drawing</EmptyBox>;

  return (
    <button
      type="button"
      className={`portal-drawing portal-drawing--${size}`}
      aria-label={`Open drawing ${file.filename} full size`}
      onClick={() => window.open(url, '_blank')}
    >
      <img src={trimmed && trimmed.source === images[0] ? trimmed.result : images[0]} alt={`Drawing ${file.filename}`} />
    </button>
  );
}
