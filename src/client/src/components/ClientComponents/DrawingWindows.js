import React, { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDrawingUrl } from '../../api/portalApi';
import DrawingTile from './DrawingTile';
import StageBadge from './StageBadge';
import '../Styling/PortalWindows.css';

const MAX_WINDOWS = 6;
const HINT = 'Click parts in the rail to add \u00b7 hover a drawing to see its details \u00b7 Esc or click the dark to close';
const SWIPE_MIN_PX = 50;
const PHONE_QUERY = '(max-width: 599px)';
const TILE_ASPECT = 1.4;
const TILE_WIDTH_PX = { 1: 1100, 2: 700, 4: 560, 6: 420, phone: 600 };

const isPhone = () => Boolean(window.matchMedia?.(PHONE_QUERY).matches);
const gridSize = (count) => (count <= 2 ? count : count <= 4 ? 4 : 6);

export function useDrawingWindows() {
  const [open, setOpen] = useState([]);
  const [focusedKey, setFocusedKey] = useState(null);

  const openPart = useCallback((part) => {
    setOpen((current) => (current.some((p) => p.key === part.key)
      ? current
      : [...current, part].slice(-MAX_WINDOWS)));
    setFocusedKey(part.key);
  }, []);

  const close = useCallback((key) => {
    const remaining = open.filter((p) => p.key !== key);
    setOpen(remaining);
    if (key === focusedKey) setFocusedKey(remaining.length ? remaining[remaining.length - 1].key : null);
  }, [open, focusedKey]);

  const closeAll = useCallback(() => {
    setOpen([]);
    setFocusedKey(null);
  }, []);

  return { open, focusedKey, openPart, focus: setFocusedKey, close, closeAll };
}

function Fact({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return <span className="portal-window-fact"><em>{label}</em> {value}</span>;
}

function Window({ part, number, isFocused, width, onFocus, onClose }) {
  return (
    <section className={`portal-window${isFocused ? ' portal-window--focus' : ''}`} onClick={() => onFocus(part.key)}>
      <b className="portal-window-number">{number}</b>
      <button type="button" className="portal-window-x" aria-label="Close window" onClick={(event) => { event.stopPropagation(); onClose(part.key); }}>
        {'×'}
      </button>
      {isFocused && (
        <header className="portal-window-head">
          <strong>{part.part_number}</strong>
          {part.rev && <span className="portal-window-rev">Rev {part.rev}</span>}
          {part.description && <span>{part.description}</span>}
          <StageBadge stage={part.stage} />
          {part.job_number && <span>{'\u00b7'} job {part.job_number}</span>}
        </header>
      )}
      <DrawingTile file={part.drawing} width={width} aspect={TILE_ASPECT} />
      {isFocused && (
        <footer className="portal-window-facts">
          <Fact label="Material" value={part.material} />
          <Fact label="Finish" value={part.finish} />
          <Fact label="Qty" value={part.quantity} />
        </footer>
      )}
    </section>
  );
}

export default function DrawingWindows({ windows, focusedKey, onFocus, onClose, onCloseAll, railed = false }) {
  const swipeStartRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (windows.length === 0) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') onClose(focusedKey); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [windows.length, focusedKey, onClose]);

  if (windows.length === 0) return null;

  const phone = isPhone();
  const focusedIndex = Math.max(0, windows.findIndex((p) => p.key === focusedKey));
  const shown = phone ? [windows[focusedIndex]] : windows;
  const size = phone ? 1 : gridSize(windows.length);
  const width = phone ? TILE_WIDTH_PX.phone : TILE_WIDTH_PX[size];

  const focused = windows[focusedIndex];
  const openFocusedPdf = async () => {
    const result = await fetchDrawingUrl(focused.drawing);
    if (!result.ok) return setError(result.error.message);
    setError(null);
    window.open(result.url, '_blank');
  };

  const handleBackdrop = (event) => {
    if (!event.target.closest('.portal-window, .portal-windows-bar')) onCloseAll();
  };
  const handleTouchStart = (event) => { swipeStartRef.current = event.touches[0].clientX; };
  const handleTouchEnd = (event) => {
    const delta = event.changedTouches[0].clientX - swipeStartRef.current;
    if (Math.abs(delta) <= SWIPE_MIN_PX) return;
    const target = windows[focusedIndex + (delta < 0 ? 1 : -1)];
    if (target) onFocus(target.key);
  };

  return (
    <div className={`portal-windows-backdrop${railed ? ' portal-windows-backdrop--railed' : ''}`} onClick={handleBackdrop}>
      <div className="portal-windows-bar">
        <strong>{windows.length} of {MAX_WINDOWS} drawings open</strong>
        <span className="portal-windows-hint">{HINT}</span>
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={!focused.drawing} onClick={openFocusedPdf}>Open focused PDF</button>
        <button type="button" onClick={onCloseAll}>Close all</button>
      </div>
      <div
        className={`portal-windows portal-windows--${size}`}
        onTouchStart={phone ? handleTouchStart : undefined}
        onTouchEnd={phone ? handleTouchEnd : undefined}
      >
        {shown.map((part) => (
          <Window
            key={part.key}
            part={part}
            number={windows.indexOf(part) + 1}
            isFocused={part.key === windows[focusedIndex].key}
            width={width}
            onFocus={onFocus}
            onClose={onClose}
          />
        ))}
      </div>
      {phone && (
        <div className="portal-windows-dots">
          {windows.map((part, index) => (
            <i key={part.key} className={`portal-windows-dot${index === focusedIndex ? ' portal-windows-dot--on' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}
