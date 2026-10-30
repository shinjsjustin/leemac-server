import React, { useEffect, useRef, useState } from 'react';
import { enqueue as sharedEnqueue } from './drawingQueue';
import '../Styling/PortalTile.css';

export default function DrawingTile({ file, width, aspect, onOpen, enqueue = sharedEnqueue }) {
  const boxRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [result, setResult] = useState(null);
  const [isBroken, setIsBroken] = useState(false);
  const boxStyle = { aspectRatio: String(aspect) };
  const fileId = file?.id;
  const fileRef = useRef(file);
  fileRef.current = file;
  const hasFile = Boolean(file);

  useEffect(() => {
    if (!hasFile || isVisible) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setIsVisible(true);
        observer.disconnect();
      }
    });
    // The skeleton (and so the ref) is gone once the tile has a result.
    if (boxRef.current) observer.observe(boxRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId, hasFile, isVisible]);

  useEffect(() => {
    if (!hasFile || !isVisible) return undefined;
    setIsBroken(false);
    const job = enqueue(fileRef.current, width);
    job.promise.then((outcome) => { if (!outcome.cancelled) setResult(outcome); });
    return () => job.cancel();
  }, [fileId, hasFile, width, isVisible, enqueue]);

  if (!file) {
    return <div className="portal-tile portal-tile--empty" style={boxStyle}>No drawing</div>;
  }
  if (isBroken || (result && !result.ok)) {
    return (
      <button
        type="button"
        className="portal-tile portal-tile--empty"
        style={boxStyle}
        aria-label={`Open ${file.filename}`}
        onClick={() => onOpen && onOpen(file)}
      >
        Preview unavailable
      </button>
    );
  }
  if (!result) {
    return <div ref={boxRef} className="portal-tile portal-tile--skeleton" style={boxStyle} data-loading="true" />;
  }
  return (
    <button
      type="button"
      className="portal-tile portal-tile--ready"
      style={boxStyle}
      aria-label={`Open drawing ${file.filename}`}
      onClick={() => onOpen && onOpen(file)}
    >
      <img src={result.src} alt={`Drawing ${file.filename}`} onError={() => setIsBroken(true)} />
    </button>
  );
}
