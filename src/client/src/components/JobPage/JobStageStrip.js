import React from 'react';
import { chipText, stageOfStatus, STAGES } from '../Overview/overviewStages';

const NOT_STARRED = 'Not starred';

function barFor(part, stage) {
  if (!stage || !stage.starred) return { key: part.job_part_id, label: `${part.number} · ${NOT_STARRED}` };
  const index = stageOfStatus(stage.status);
  return {
    key: part.job_part_id,
    label: `${part.number} · ${chipText(stage.status)}`,
    style: index === -1 ? undefined : { '--sc': `var(--s-${STAGES[index].key})` },
  };
}

export default function JobStageStrip({ parts, stages }) {
  const byPart = new Map(stages.map((s) => [s.job_part_id, s]));
  return (
    <div className="jh-prog">
      <span className="jh-cap">Stages</span>
      <div className="jh-bars">
        {parts.map((part) => {
          const { key, label, style } = barFor(part, byPart.get(part.job_part_id));
          return (
            <div className="jh-bar" key={key} style={style}>
              <i />
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
