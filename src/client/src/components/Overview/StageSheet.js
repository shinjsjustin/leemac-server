import React, { useEffect } from 'react';
import { STAGES } from './overviewStages';
import './stageSheet.css';

export default function StageSheet({ open, status, urgent, waiting, onSetStatus, onSetFlag, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const pickStatus = (key) => { onSetStatus(key); onClose(); };
  const toggleFlag = (name, value) => { onSetFlag(name, !value); onClose(); };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-flags">
          <button type="button" className={`flag urgent${urgent ? ' on' : ''}`} onClick={() => toggleFlag('urgent', urgent)}>Urgent</button>
          <button type="button" className={`flag waiting${waiting ? ' on' : ''}`} onClick={() => toggleFlag('waiting', waiting)}>Waiting</button>
        </div>
        {STAGES.map((stage) => (
          <div className="sheet-grp" key={stage.key} style={{ '--sc': `var(--s-${stage.key})` }}>
            <h6>{stage.label} {stage.ko}</h6>
            {stage.subs.map(([key, label]) => (
              <button key={key} type="button" className={`sub${key === status ? ' on' : ''}`} onClick={() => pickStatus(key)}>{label}</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
