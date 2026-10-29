import React, { useEffect, useRef, useState } from 'react';
import { enqueue } from './drawingQueue';
import '../Styling/PortalTile.css';

export default function DrawingTile({ file, width, aspect, onOpen }) {
  const boxRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [result, setResult] = useState(null);
  const [isBroken, setIsBroken] = useState(false);
  const boxStyle = { aspectRatio: String(aspect) };

  useEffect(() => {
    if (!file) return undefined;
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
    observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, [file]);

  useEffect(() => {
    if (!file || !isVisible) return undefined;
    setIsBroken(false);
    const job = enqueue(file, width);
    job.promise.then((outcome) => { if (!outcome.cancelled) setResult(outcome); });
    return () => job.cancel();
  }, [file, width, isVisible]);

  if (!file || isBroken || (result && !result.ok)) {
    return <div className="portal-tile portal-tile--empty" style={boxStyle}>No drawing</div>;
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
