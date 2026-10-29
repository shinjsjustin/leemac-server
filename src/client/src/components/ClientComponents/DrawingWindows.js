import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchDrawingUrl, formatDate } from '../../api/portalApi';
import DrawingTile from './DrawingTile';
import StageBadge from './StageBadge';
import '../Styling/PortalWindows.css';

const MAX_WINDOWS = 6;
const HINT = 'Click parts in the rail to add \u00b7 hover a drawing to see its details \u00b7 Esc or click the dark to close';
const SWIPE_MIN_PX = 50;
const PHONE_QUERY = '(max-width: 599px)';
const TILE_ASPECT = 1.4;
const THUMB_WIDTH_PX = 90;
const SWIPE_HINT = 'Swipe to switch drawings';
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
  return <div className="portal-window-fact"><em>{label}</em><span>{value}</span></div>;
}

function PastOrders({ jobs }) {
  if (!jobs) return null;
  return (
    <div className="portal-window-fact portal-window-past">
      <em>Past orders {'\u00b7'} {jobs.length}</em>
      {jobs.map((job) => (
        <span key={job.id}>
          <Link to={`/client-job/${job.id}`}>{job.job_number}</Link>
          {job.quantity ? ` \u00d7${job.quantity}` : ''}
          {job.po_date ? ` ${formatDate(job.po_date)}` : ''}
        </span>
      ))}
    </div>
  );
}

function Facts({ part, jobs }) {
  return (
    <footer className="portal-window-facts">
      <Fact label="Material" value={part.material} />
      <Fact label="Finish" value={part.finish} />
      <Fact label="Qty" value={part.quantity} />
      <Fact label="Job" value={part.job_number} />
      <PastOrders jobs={jobs} />
    </footer>
  );
}

function Header({ part }) {
  return (
    <>
      <strong>{part.part_number}</strong>
      {part.rev && <span className="portal-window-rev">Rev {part.rev}</span>}
      {part.description && <span>{part.description}</span>}
      <StageBadge stage={part.stage} />
      {part.job_number && <span>{'\u00b7'} job {part.job_number}</span>}
    </>
  );
}

// Loads past orders for the focused part once per key; a failed load is cached as null.
function usePastOrders(loadPart, part) {
  const [cache, setCache] = useState({});
  const requested = useRef(new Set());
  const key = part?.key;
  const partId = part?.partId ?? key;

  useEffect(() => {
    if (!loadPart || !part || requested.current.has(key)) return;
    requested.current.add(key);
    loadPart(partId).then((result) => {
      setCache((current) => ({ ...current, [key]: result.ok ? result.data.jobs : null }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadPart, key, partId]);

  return cache[key] ?? null;
}

function Window({ part, number, isFocused, width, jobs, onFocus, onClose }) {
  return (
    <section className={`portal-window${isFocused ? ' portal-window--focus' : ''}`} onClick={() => onFocus(part.key)}>
      <b className="portal-window-number">{number}</b>
      <button type="button" className="portal-window-x" aria-label="Close window" onClick={(event) => { event.stopPropagation(); onClose(part.key); }}>
        {'×'}
      </button>
      {isFocused && <header className="portal-window-head"><Header part={part} /></header>}
      <DrawingTile file={part.drawing} width={width} aspect={TILE_ASPECT} />
      {isFocused && <Facts part={part} jobs={jobs} />}
    </section>
  );
}

function PhoneViewer({ windows, focused, jobs, width, onFocus, onClose }) {
  return (
    <section className="portal-window portal-phone-viewer">
      <header className="portal-window-head">
        <Header part={focused} />
        <button type="button" className="portal-window-x" aria-label="Close window" onClick={() => onClose(focused.key)}>{'×'}</button>
      </header>
      <DrawingTile file={focused.drawing} width={width} aspect={TILE_ASPECT} />
      <p className="portal-phone-hint">{SWIPE_HINT}</p>
      <Facts part={focused} jobs={jobs} />
      <div className="portal-phone-thumbs">
        {windows.map((part) => (
          <button
            key={part.key}
            type="button"
            aria-label={part.part_number}
            className={`portal-phone-thumb${part.key === focused.key ? ' portal-phone-thumb--on' : ''}`}
            onClick={() => onFocus(part.key)}
          >
            <DrawingTile file={part.drawing} width={THUMB_WIDTH_PX} aspect={TILE_ASPECT} />
          </button>
        ))}
      </div>
    </section>
  );
}

export default function DrawingWindows({ windows, focusedKey, onFocus, onClose, onCloseAll, railed = false, loadPart }) {
  const swipeStartRef = useRef(null);
  const [error, setError] = useState(null);
  const focusedKeyNow = windows.find((p) => p.key === focusedKey) ?? windows[0];
  const jobs = usePastOrders(loadPart, focusedKeyNow);

  useEffect(() => {
    if (windows.length === 0) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') onClose(focusedKey); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [windows.length, focusedKey, onClose]);

  if (windows.length === 0) return null;

  const phone = isPhone();
  const focusedIndex = Math.max(0, windows.findIndex((p) => p.key === focusedKey));
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
        {phone && (
          <PhoneViewer windows={windows} focused={focused} jobs={jobs} width={width} onFocus={onFocus} onClose={onClose} />
        )}
        {!phone && windows.map((part) => (
          <Window
            key={part.key}
            part={part}
            number={windows.indexOf(part) + 1}
            isFocused={part.key === windows[focusedIndex].key}
            width={width}
            jobs={jobs}
            onFocus={onFocus}
            onClose={onClose}
          />
        ))}
      </div>
    </div>
  );
}
