import React, { useEffect, useRef, useState } from 'react';
import { STAGES, stageOfStatus, chipText } from './overviewStages';
import './stageControl.css';

const stageColor = (index) => ({ '--sc': `var(--s-${STAGES[index].key})` });

function SubMenu({ index, status, onPick }) {
  const stage = STAGES[index];
  return (
    <div className="menu" style={{ left: `${(index / STAGES.length) * 100}%` }}>
      <h6>{stage.label} {stage.ko}</h6>
      {stage.subs.map(([key, label], n) => (
        <button key={key} type="button" className={key === status ? 'on' : ''} style={stageColor(index)} onClick={() => onPick(key)}>
          <i />{label}<span className="k">{n + 1}</span>
        </button>
      ))}
    </div>
  );
}

function FullMenu({ status, onPick }) {
  return (
    <div className="menu wide">
      {STAGES.map((stage, index) => (
        <div className="m-grp" key={stage.key}>
          <h6>{stage.label} {stage.ko}</h6>
          {stage.subs.map(([key, label]) => (
            <button key={key} type="button" className={key === status ? 'on' : ''} style={stageColor(index)} onClick={() => onPick(key)}>
              <i />{stage.subs.length > 1 ? label : stage.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function StageControl({ status, urgent, waiting, since, onSetStatus, onSetFlag, disabled }) {
  // null, a stage index (sub-step menu) or 'all' (chip menu)
  const [menu, setMenu] = useState(null);
  const rootRef = useRef(null);
  const current = stageOfStatus(status);

  useEffect(() => {
    if (menu === null) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') return setMenu(null);
      const sub = typeof menu === 'number' && STAGES[menu].subs[Number(e.key) - 1];
      if (sub) pick(sub[0]);
    };
    const onMouseDown = (e) => {
      if (!rootRef.current.contains(e.target)) setMenu(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  });

  const pick = (sub) => {
    setMenu(null);
    onSetStatus(sub);
  };

  const clickSegment = (index) => {
    const { subs } = STAGES[index];
    if (subs.length === 1) return pick(subs[0][0]);
    setMenu(menu === index ? null : index);
  };

  const flag = (name, value, label) => (
    <button type="button" className={`flag ${name}${value ? ' on' : ''}`} disabled={disabled} onClick={() => onSetFlag(name, !value)}>
      {label}
    </button>
  );

  return (
    <div className="stage-control" ref={rootRef}>
      <div className="stagebar">
        {STAGES.map((stage, index) => (
          <button
            key={stage.key}
            type="button"
            title={stage.label}
            disabled={disabled}
            className={index < current ? 'past' : index === current ? 'cur' : ''}
            style={stageColor(index)}
            onClick={() => clickSegment(index)}
          >
            {stage.short}
          </button>
        ))}
        {typeof menu === 'number' && <SubMenu index={menu} status={status} onPick={pick} />}
      </div>
      <div className="stage-line">
        <div className="stage-chip-wrap">
          <button
            type="button"
            className="chip"
            disabled={disabled}
            style={current === -1 ? undefined : stageColor(current)}
            onClick={() => setMenu(menu === 'all' ? null : 'all')}
          >
            {chipText(status)} <span className="car">▾</span>
          </button>
          {menu === 'all' && <FullMenu status={status} onPick={pick} />}
        </div>
        {flag('urgent', urgent, 'Urgent')}
        {flag('waiting', waiting, 'Waiting')}
        <span className="seen">
          <span title="Client sees this stage" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
          </span>{' '}since {since}
        </span>
      </div>
    </div>
  );
}
