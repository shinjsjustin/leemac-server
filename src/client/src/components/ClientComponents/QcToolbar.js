import React from 'react';
import { toolbarModel } from './qcToolbarModel';
import { QC_ICONS } from './qcIcons';
import '../Styling/QcToolbar.css';

const WIDTH_INPUT_ID = 'qc-width-input';

function buttonClass(item) {
  return [
    'qc-btn',
    item.iconOnly && 'qc-btn--icon',
    item.id === 'zoom' && 'qc-btn--zoom',
    item.variant === 'primary' && 'qc-btn--primary',
    item.variant === 'danger' && 'qc-btn--clear',
    item.dirty && 'is-dirty',
  ].filter(Boolean).join(' ');
}

export default function QcToolbar({ side = 'client', state, dispatch, status, onSave, onClear, onPing }) {
  const model = toolbarModel(state, side, status);
  const commands = { save: onSave, clear: onClear, ping: onPing };

  const renderItem = (item) => {
    const isTool = item.action && item.action.type === 'pickTool';
    const onClick = item.command ? commands[item.command] : () => dispatch(item.action);
    return (
      <button
        key={item.id}
        type="button"
        className={buttonClass(item)}
        title={item.label}
        aria-label={item.iconOnly ? item.label : undefined}
        aria-pressed={isTool ? item.pressed : undefined}
        onClick={onClick}
      >
        {QC_ICONS[item.icon]}
        {!item.iconOnly && item.label}
      </button>
    );
  };

  return (
    <div className="portal-qc-toolbar">
      <div className="qc-toolbar" role="toolbar" aria-label="Drawing tools">
        {model.groups.map((group, index) => (
          <React.Fragment key={group[0].id}>
            {index === 1 && <span className="qc-sep" />}
            {index === 2 && <span className="qc-spacer" />}
            <div className="qc-group">{group.map(renderItem)}</div>
          </React.Fragment>
        ))}
        <p className="qc-hint" aria-live="polite">{model.hint}</p>
        {model.width && (
          <div className="qc-width">
            <label htmlFor={WIDTH_INPUT_ID}>Point width</label>
            <input
              id={WIDTH_INPUT_ID}
              type="range"
              aria-label="Point size"
              min={model.width.min}
              max={model.width.max}
              value={model.width.value}
              onChange={(event) => dispatch({ type: 'setSize', size: Number(event.target.value) })}
            />
            <output>{model.width.value}</output>
            <span className="qc-width-swatch">
              <span className="qc-width-dot" style={{ width: model.width.preview, height: model.width.preview }} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
