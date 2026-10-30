import React, { useEffect, useState } from 'react';
import { PdfThumbnail } from '../PdfImage';
import PrintActions from '../PrintActions';
import { usePdfUrls } from '../Overview/PartRow';
import './partDrawingStrip.css';

export default function PartDrawingStrip({ partId }) {
  const drawings = usePdfUrls(partId);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') setIsOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  if (drawings.length === 0) return null;

  return (
    <div className="jp-strip">
      {drawings.map((d) => (
        <PdfThumbnail key={d.id} previewUrl={d.url} onClick={() => window.open(d.url, '_blank')} />
      ))}
      <div className="jp-strip-menu-wrap">
        <button type="button" className="jp-strip-btn" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
          Drawings ▾
        </button>
        {isOpen && (
          <div className="jp-strip-menu">
            {drawings.map((d) => (
              <div key={d.id} className="jp-strip-item">
                <span>{d.filename}</span>
                <PrintActions fileId={d.id} filename={d.filename} kind="drawing" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
