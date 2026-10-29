import React from 'react';
import DrawingTile from './DrawingTile';
import StageBadge from './StageBadge';
import { NoteTarget } from './NotePin';
import { isBlank } from './PortalField';
import '../Styling/PortalParts.css';

const TILE_WIDTH_PX = 300;
const TILE_ASPECT = 1.4;

function Marker({ number }) {
  if (!number) return null;
  return <span className="portal-part-marker">{number}</span>;
}

function Check({ part, isSelected, onToggle }) {
  return (
    <input
      type="checkbox"
      className="portal-part-check"
      checked={isSelected}
      aria-label={`Select ${part.part_number}`}
      onChange={() => onToggle(part.part_id)}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

function Facts({ part }) {
  const { latest } = part;
  const material = [latest?.material, latest?.finish].filter((v) => !isBlank(v)).join(' \u00b7 ');
  const orderCount = part.jobs?.length ?? 0;
  const facts = [
    material,
    latest?.quantity > 0 ? `\u00d7${latest.quantity}` : '',
    orderCount > 0 ? `${orderCount}\u00d7 ordered` : '',
  ].filter(Boolean);
  if (facts.length === 0) return null;
  return (
    <div className="portal-part-facts">
      {facts.map((fact) => <span key={fact}>{fact}</span>)}
    </div>
  );
}

function Card({ part, ...state }) {
  const { latest } = part;
  return (
    <>
      <DrawingTile file={part.latest_drawing} width={TILE_WIDTH_PX} aspect={TILE_ASPECT} />
      <Marker number={state.number} />
      <Check part={part} isSelected={state.isSelected} onToggle={state.onToggle} />
      <div className="portal-part-head">
        <b className="portal-part-num">{part.part_number}</b>
        {!isBlank(latest?.rev) && <span className="portal-part-rev">Rev {latest.rev}</span>}
        <StageBadge stage={latest?.stage} />
        {!isBlank(latest?.job_number) && <span className="portal-part-job">{latest.job_number}</span>}
      </div>
      {!isBlank(part.part_description) && <p className="portal-part-desc">{part.part_description}</p>}
      <Facts part={part} />
    </>
  );
}

function Row({ part, ...state }) {
  const { latest } = part;
  return (
    <>
      <Check part={part} isSelected={state.isSelected} onToggle={state.onToggle} />
      <Marker number={state.number} />
      <b className="portal-part-num">{part.part_number}</b>
      <span className="portal-part-rev">{latest?.rev}</span>
      <span className="portal-part-desc">{part.part_description}</span>
      <StageBadge stage={latest?.stage} />
      <span className="portal-part-job">{latest?.job_number}</span>
      <span className="portal-part-qty">{latest?.quantity}</span>
    </>
  );
}

function openOnKey(event, onOpen, part) {
  if (event.target !== event.currentTarget) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onOpen(part);
}

export default function PartWall({ parts, view, selectedIds, onToggle, onOpen, openNumbers, focusedKey, notes, onNoteAdded }) {
  const isTable = view === 'table';
  const Body = isTable ? Row : Card;
  const kind = isTable ? 'portal-part-row' : 'portal-part-card';
  return (
    <div className={isTable ? 'portal-parts-table' : 'portal-parts-grid'}>
      {parts.map((part) => {
        const isSelected = selectedIds.includes(part.part_id);
        const isFocused = focusedKey === part.part_id;
        const className = `${kind}${isSelected ? ' portal-part-card--selected' : ''}${isFocused ? ' portal-part-card--focused' : ''}`;
        return (
          <NoteTarget key={part.part_id} notes={notes[part.part_id] ?? []} target={{ part_id: part.part_id }} onAdded={onNoteAdded}>
            <div
              className={className}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(part)}
              onKeyDown={(event) => openOnKey(event, onOpen, part)}
            >
              <Body part={part} isSelected={isSelected} onToggle={onToggle} number={openNumbers[part.part_id]} />
            </div>
          </NoteTarget>
        );
      })}
    </div>
  );
}
