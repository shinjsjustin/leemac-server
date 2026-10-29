import React from 'react';
import { STAGES, stageOfStatus, chipText } from './overviewStages';
import './stageBoard.css';

const stageIndex = (key) => STAGES.findIndex((s) => s.key === key);
const COLUMN_KEYS = ['material', 'preparing', 'machining', 'outside', 'finishing', 'inspection', 'packing'];
const EARLY_KEYS = ['quoted'];
const LATE_KEYS = ['done', 'delivered', 'invoiced'];

const inStages = (part, keys) => keys.map(stageIndex).includes(stageOfStatus(part.status));

function Card({ entry, onOpenJob }) {
  const { part, job } = entry;
  return (
    <button type="button" className="sb-card" onClick={() => onOpenJob(job.id)}>
      <span className="pn">{part.number}</span>
      <span className="jb">{job.job_number} · {job.company_name}</span>
      <span className="chip">{chipText(part.status)}</span>
      {(part.urgent || part.waiting) && (
        <span className="marks">
          {part.urgent && <em className="urgent">Urgent</em>}
          {part.waiting && <em className="waiting">Waiting</em>}
        </span>
      )}
    </button>
  );
}

function Stack({ title, entries, onOpenJob }) {
  return (
    <section className="sb-stack">
      <h3><b>{title}</b><i>{entries.length}</i></h3>
      {entries.map((entry) => (
        <button type="button" key={entry.part.job_part_id} onClick={() => onOpenJob(entry.job.id)}>
          {entry.part.number}
        </button>
      ))}
    </section>
  );
}

export default function StageBoard({ jobs, onOpenJob }) {
  const entries = jobs.flatMap((job) => job.parts.map((part) => ({ part, job })));
  // 'open' maps to no stage; it sits with Quoted since neither has started.
  const early = entries.filter(({ part }) => inStages(part, EARLY_KEYS) || stageOfStatus(part.status) === -1);

  return (
    <div className="sb-board">
      <Stack title="Quoted / In the shop" entries={early} onOpenJob={onOpenJob} />
      {COLUMN_KEYS.map((key) => {
        const stage = STAGES[stageIndex(key)];
        const column = entries.filter(({ part }) => inStages(part, [key]));
        return (
          <section className="sb-col" key={key} style={{ '--sc': `var(--s-${key})` }}>
            <h3><b>{stage.label}</b><span>{stage.ko}</span><i>{column.length}</i></h3>
            {column.map((entry) => <Card key={entry.part.job_part_id} entry={entry} onOpenJob={onOpenJob} />)}
          </section>
        );
      })}
      <Stack title="Done / Delivered / Invoiced" entries={entries.filter(({ part }) => inStages(part, LATE_KEYS))} onOpenJob={onOpenJob} />
    </div>
  );
}
