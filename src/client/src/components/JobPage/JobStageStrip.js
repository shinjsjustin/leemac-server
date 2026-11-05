import React from 'react';
import { useIsPhone } from '../Overview/StageControl';
import { stageOfStatus, STAGES } from '../Overview/overviewStages';

const NOT_STARRED = 'Not starred';
const IN_THE_SHOP = 'In the shop';
const NOT_STARRED_SLOT = STAGES.length;
const IN_THE_SHOP_SLOT = -1;

function summaryChips(parts, byPart) {
  const counts = new Map();
  parts.forEach((part) => {
    const stage = byPart.get(part.job_part_id);
    const slot = stage && stage.starred ? stageOfStatus(stage.status) : NOT_STARRED_SLOT;
    counts.set(slot, (counts.get(slot) || 0) + 1);
  });
  const slots = [IN_THE_SHOP_SLOT, ...STAGES.keys(), NOT_STARRED_SLOT];
  return slots.filter((slot) => counts.has(slot)).map((slot) => {
    if (slot === IN_THE_SHOP_SLOT) return { key: slot, label: IN_THE_SHOP, count: counts.get(slot) };
    if (slot === NOT_STARRED_SLOT) return { key: slot, label: NOT_STARRED, count: counts.get(slot) };
    return {
      key: slot,
      label: STAGES[slot].label,
      count: counts.get(slot),
      style: { '--sc': `var(--s-${STAGES[slot].key})` },
    };
  });
}

export default function JobStageStrip({ parts, stages }) {
  const isPhone = useIsPhone();
  if (!isPhone) return null;
  const byPart = new Map(stages.map((s) => [s.job_part_id, s]));
  return (
    <div className="jh-prog">
      <span className="jh-cap">Stages</span>
      <div className="jh-sums">
        {summaryChips(parts, byPart).map(({ key, label, count, style }) => (
          <span className="jh-sum" key={key} style={style}>{label} {count}</span>
        ))}
      </div>
    </div>
  );
}
