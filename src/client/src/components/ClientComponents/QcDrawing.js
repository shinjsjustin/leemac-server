import React, { useEffect, useReducer, useRef, useState } from 'react';
import { usePdfPageImages } from '../PdfImage';
import { fetchDrawingUrl } from '../../api/portalApi';
import { trimWithBox } from './drawingTrim';
import { hitTest, markingToView, viewToPage } from './qcGeometry';
import { initialState, reduce, SIZE_DEFAULT } from './qcEditor';
import { saveChanges, pingAfterSave, clearAll } from './qcSync';
import QcToolbar from './QcToolbar';
import '../Styling/PortalQc.css';

const RENDER_WIDTH = 1400;
const VIEW_WIDTH = 900;
const HIT_RADIUS_PX = 14;
const AUTOSAVE_MS = 1500;
const CLEAR_WARNING = 'Clear all your markings? Photos attached to them will be removed too.';

const ownFile = (fileId) => (list) => list.filter((m) => m.file_id === fileId);
const withFile = (fileId, list) => list.map((m) => (m.file_id ? m : { ...m, file_id: fileId }));

export default function QcDrawing({ file, partId, markings, selectedId, onSelect, onCleared }) {
  const forFile = ownFile(file.id);
  const [url, setUrl] = useState(null);
  const { images, failed } = usePdfPageImages(url, RENDER_WIDTH, false);
  const [trims, setTrims] = useState([]);
  const [state, dispatch] = useReducer(reduce, markings, (all) => initialState(forFile(all)));
  const [status, setStatus] = useState('');
  const [card, setCard] = useState({ x: 0, y: 0 });
  const saved = useRef(forFile(markings));
  const latest = useRef(state);
  latest.current = state;
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    let isCurrent = true;
    let loadedUrl = null;
    fetchDrawingUrl(file).then((result) => {
      if (!result.ok) return;
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
    // The file is fetched once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isCurrent = true;
    Promise.all(images.map(trimWithBox)).then((result) => { if (isCurrent) setTrims(result); });
    return () => { isCurrent = false; };
  }, [images]);

  // The page reloads markings after a clear, so the editor and the saved snapshot follow the prop.
  useEffect(() => {
    saved.current = forFile(markings);
    dispatch({ type: 'load', markings: saved.current });
  }, [markings]); // eslint-disable-line react-hooks/exhaustive-deps

  // 'Show on drawing' selects from the page; only the drawing holding the marking follows, turning to its page.
  useEffect(() => {
    const target = latest.current.markings.find((m) => m.id === selectedId);
    if (!target) return;
    dispatch({ type: 'setPage', page: target.page });
    dispatch({ type: 'select', id: target.id });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const applySaved = (result) => {
    const current = withFile(file.id, latest.current.markings);
    saved.current = current.map((m) => (m.id in result.idMap ? { ...m, id: result.idMap[m.id] } : m));
    dispatch({ type: 'markSaved', idMap: result.idMap });
  };

  const persist = async (send) => {
    const result = await send(partId, saved.current, withFile(file.id, latest.current.markings));
    if (result.idMap) applySaved(result);
    setStatus(result.ok ? '' : result.error.message);
    return result;
  };

  useEffect(() => {
    if (!state.dirty) return undefined;
    const timer = setTimeout(() => persist(saveChanges), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [state.markings]); // eslint-disable-line react-hooks/exhaustive-deps

  const ping = async () => {
    const result = await persist(pingAfterSave);
    if (result.ok) setStatus('Leemac has been pinged.');
  };

  const clear = async () => {
    if (!window.confirm(CLEAR_WARNING)) return;
    const result = await clearAll(partId);
    if (!result.ok) return setStatus(result.error.message);
    setStatus('');
    onCleared(result.data);
  };

  const trim = trims[state.page - 1];
  const pageMarkings = state.markings.filter((m) => m.page === state.page);
  const viewHeight = trim ? ((trim.box ? trim.box.height : trim.pageHeight) * VIEW_WIDTH) / (trim.box ? trim.box.width : trim.pageWidth) : 0;

  const toView = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    const unit = VIEW_WIDTH / rect.width;
    return { point: { x: (event.clientX - rect.left) * unit, y: (event.clientY - rect.top) * unit }, unit };
  };

  const handleMove = (event) => {
    if (dragRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      dispatch({ type: 'pan', dx: -(event.clientX - dragRef.current.x) / rect.width, dy: -(event.clientY - dragRef.current.y) / rect.height });
      dragRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    const { point, unit } = toView(event);
    const [hit] = hitTest(pageMarkings, point, trim, VIEW_WIDTH, HIT_RADIUS_PX * unit);
    const wrap = wrapRef.current.getBoundingClientRect();
    setCard({ x: event.clientX - wrap.left, y: event.clientY - wrap.top });
    const id = hit ? hit.id : null;
    if (id !== state.hoveredId) dispatch({ type: 'hover', id });
  };

  const handleDown = (event) => {
    if (state.tool === 'pan') dragRef.current = { x: event.clientX, y: event.clientY };
  };
  const endDrag = () => { dragRef.current = null; };

  const handleClick = (event) => {
    if (state.tool === 'pan') return;
    const { point, unit } = toView(event);
    if (state.tool === 'none') {
      const [hit] = hitTest(pageMarkings, point, trim, VIEW_WIDTH, HIT_RADIUS_PX * unit);
      if (!hit) return;
      dispatch({ type: 'select', id: hit.id });
      onSelect(hit);
      return;
    }
    dispatch({ type: 'click', point: viewToPage(point, trim, VIEW_WIDTH), page: state.page });
  };

  const hovered = state.markings.find((m) => m.id === state.hoveredId);
  const isOwn = (m) => m.mine && !m.is_leemac;
  const keepHover = (event) => {
    if (!event.relatedTarget || !event.relatedTarget.closest || !event.relatedTarget.closest('.portal-qc-card')) {
      dispatch({ type: 'hover', id: null });
    }
  };

  const renderMarking = (m, index) => {
    const v = markingToView(m, trim, VIEW_WIDTH);
    const cls = `portal-qc-mark${m.is_leemac ? ' portal-qc-mark--leemac' : ''}${m.id === state.hoveredId ? ' is-hot' : ''}${m.id === state.selectedId ? ' is-selected' : ''}`;
    const label = <text className="portal-qc-num" x={v.x1 + 6} y={v.y1 - 6}>{index + 1}</text>;
    if (v.kind === 'point') {
      return <g key={m.id} className={cls}><circle cx={v.x1} cy={v.y1} r={(m.size || SIZE_DEFAULT) / 2} />{label}</g>;
    }
    if (v.kind === 'line') {
      return <g key={m.id} className={cls}><line x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2} />{label}</g>;
    }
    return (
      <g key={m.id} className={cls}>
        <rect x={Math.min(v.x1, v.x2)} y={Math.min(v.y1, v.y2)} width={Math.abs(v.x2 - v.x1)} height={Math.abs(v.y2 - v.y1)} />
        {label}
      </g>
    );
  };

  if (failed) return <div className="portal-drawing-empty portal-drawing--large">Drawing unavailable</div>;
  if (!trim) return <div className="portal-drawing-empty portal-drawing--large">Loading drawing</div>;

  const { zoom, pan } = state;
  return (
    <div className="portal-qc">
      <QcToolbar state={state} dispatch={dispatch} status={status} onSave={() => persist(saveChanges)} onClear={clear} onPing={ping} />
      {images.length > 1 && (
        <div className="portal-qc-pages">
          {images.map((src, i) => (
            <button
              key={src.slice(-32) + i}
              type="button"
              className={state.page === i + 1 ? 'is-active' : undefined}
              onClick={() => dispatch({ type: 'setPage', page: i + 1 })}
            >
              Page {i + 1}
            </button>
          ))}
        </div>
      )}
      <div ref={wrapRef} className={`portal-qc-view${state.tool === 'pan' ? ' is-pan' : ''}`}>
        <div
          className="portal-qc-stage"
          style={{ width: `${zoom * 100}%`, transform: `translate(${(-pan.x / zoom) * 100}%, ${(-pan.y / zoom) * 100}%)` }}
        >
          <img src={trim.url} alt={`Drawing ${file.filename}`} draggable={false} />
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_WIDTH} ${viewHeight}`}
            onPointerMove={handleMove}
            onPointerDown={handleDown}
            onPointerUp={endDrag}
            onPointerLeave={(event) => { endDrag(); keepHover(event); }}
            onClick={handleClick}
          >
            {pageMarkings.map(renderMarking)}
            {state.pending && state.pending.page === state.page && (() => {
              const p = markingToView({ kind: 'point', x1: state.pending.x, y1: state.pending.y }, trim, VIEW_WIDTH);
              return <circle className="portal-qc-pending" cx={p.x1} cy={p.y1} r={4} />;
            })()}
          </svg>
        </div>
        {hovered && hovered.page === state.page && (
          <div className="portal-qc-card" style={{ left: card.x + 12, top: card.y + 12 }} onPointerLeave={() => dispatch({ type: 'hover', id: null })}>
            <div className="portal-qc-card-head">
              {hovered.is_leemac && <b className="portal-pin-note-tag portal-pin-note-tag--leemac">LEEMAC</b>}
              <span>Marking {state.markings.filter((m) => m.page === state.page).indexOf(hovered) + 1}</span>
            </div>
            {isOwn(hovered) ? (
              <>
                <textarea
                  aria-label="Marking note"
                  value={hovered.note || ''}
                  onChange={(event) => dispatch({ type: 'setNote', id: hovered.id, note: event.target.value })}
                />
                <button type="button" onClick={() => dispatch({ type: 'erase', id: hovered.id })}>Delete</button>
              </>
            ) : (
              <>
                <p>{hovered.note}</p>
                <small>Read-only{hovered.is_leemac ? ' · added by Leemac' : ''}</small>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
