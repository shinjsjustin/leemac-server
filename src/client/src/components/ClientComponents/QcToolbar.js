import React from 'react';
import { SIZE_MIN, SIZE_MAX, hint } from './qcEditor';

const TOOLS = [['pan', 'Pan'], ['point', 'Point'], ['line', 'Line'], ['box', 'Box']];
const PERCENT = 100;

export default function QcToolbar({ side = 'client', state, dispatch, status, onSave, onClear, onPing }) {
  return (
    <div className="portal-qc-toolbar">
      <div className="portal-qc-bar">
        <button type="button" aria-label="Zoom out" onClick={() => dispatch({ type: 'zoom', direction: 'out' })}>-</button>
        <span className="portal-qc-zoom">{Math.round(state.zoom * PERCENT)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => dispatch({ type: 'zoom', direction: 'in' })}>+</button>
        {TOOLS.map(([tool, label]) => (
          <button
            key={tool}
            type="button"
            className={state.tool === tool ? 'is-active' : undefined}
            aria-pressed={state.tool === tool}
            onClick={() => dispatch({ type: 'pickTool', tool })}
          >
            {label}
          </button>
        ))}
        {state.tool === 'point' && (
          <input
            type="range"
            aria-label="Point size"
            min={SIZE_MIN}
            max={SIZE_MAX}
            value={state.size}
            onChange={(event) => dispatch({ type: 'setSize', size: Number(event.target.value) })}
          />
        )}
        <span className="portal-qc-spacer" />
        <button type="button" onClick={onSave}>
          Save{state.dirty && <i className="portal-qc-dot" aria-label="Unsaved changes" />}
        </button>
        <button type="button" className="portal-qc-clear" onClick={onClear}>Clear</button>
        {side === 'client' && <button type="button" className="portal-qc-ping" onClick={onPing}>Ping Leemac</button>}
      </div>
      <p className="portal-qc-hint">{status || hint(state)}</p>
    </div>
  );
}
