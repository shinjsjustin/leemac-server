import React, { useId, useState } from 'react';
import PortalDrawing from './ClientComponents/PortalDrawing';
import './Styling/PartPdfPreview.css';

// Stops clicks reaching a clickable parent such as a list row that navigates.
const stopPropagation = (event) => event.stopPropagation();

export default function PartPdfPreview({ file, drawingCount, fetchUrl }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  if (!file || drawingCount < 1) return null;

  return (
    <div className="part-preview" onClick={stopPropagation}>
      <button
        type="button"
        className="part-preview-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? 'Hide preview' : 'Click to show preview'}
      </button>
      <div id={panelId}>
        {isOpen && (
          <>
            <PortalDrawing file={file} size="landscape" fetchUrl={fetchUrl} />
            {drawingCount > 1 && (
              <p className="part-preview-note">{`1 of ${drawingCount} drawings`}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
