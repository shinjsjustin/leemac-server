import React, { useState } from 'react';
import PartListsPanel from './PartListsPanel';

const TABS = ['parts', 'lists'];

function PartRow({ part, onOpenPart }) {
  return (
    <button type="button" className="portal-overview-part" onClick={() => onOpenPart(part)}>
      <b>{part.part_number}</b>
      <span>{part.part_description}</span>
      <small>{part.jobs.map((job) => job.job_number).join(', ')}</small>
    </button>
  );
}

export default function OverviewRail({
  parts, lists, openNumbers, focusedKey, onOpenPart, onCreate, onRename, onDelete, isBusy,
}) {
  const [tab, setTab] = useState('parts');
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = parts.filter((part) => (
    `${part.part_number} ${part.part_description ?? ''}`.toLowerCase().includes(needle)));
  const counts = { parts: parts.length, lists: lists.length };

  return (
    <div className="portal-overview-rail">
      <div className="portal-overview-tabs" role="tablist">
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {`${key === 'parts' ? 'Parts' : 'Lists'} ${counts[key]}`}
          </button>
        ))}
      </div>
      {tab === 'parts' ? (
        <div className="portal-overview-partlist">
          <input type="text" className="portal-input" aria-label="Filter parts" placeholder="Filter parts"
            value={filter} onChange={(e) => setFilter(e.target.value)} />
          {shown.map((part) => <PartRow key={part.part_id} part={part} onOpenPart={onOpenPart} />)}
        </div>
      ) : (
        <PartListsPanel lists={lists} parts={parts} openNumbers={openNumbers} focusedKey={focusedKey}
          onOpenPart={onOpenPart} onCreate={onCreate} onRename={onRename} onDelete={onDelete} isBusy={isBusy} />
      )}
    </div>
  );
}
