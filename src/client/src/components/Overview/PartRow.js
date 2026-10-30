import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';
import { PdfThumbnail } from '../PdfImage';
import PrintActions from '../PrintActions';
import StageControl from './StageControl';
import PartNotes from './PartNotes';
import NfcPair from './NfcPair';
import './partExtras.css';

const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sinceText = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

// Object URLs for the part's PDF drawings, from the same getblob call StarredJobs used.
export function usePdfUrls(partId) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    let isCurrent = true;
    const created = [];
    apiFetch(`/internal/part/getblob?partID=${partId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((files) => {
        files.filter((f) => f.mimetype === 'application/pdf' && f.content).forEach((f) => {
          const bytes = Uint8Array.from(window.atob(f.content), (ch) => ch.charCodeAt(0));
          created.push({ id: f.id, filename: f.filename, url: URL.createObjectURL(new Blob([bytes], { type: f.mimetype })) });
        });
        if (isCurrent) setUrls([...created]);
      })
      .catch(() => {}); // a missing thumbnail must not break the row
    return () => {
      isCurrent = false;
      created.forEach((u) => URL.revokeObjectURL(u.url));
    };
  }, [partId]);
  return urls;
}

export function DrawingThumb({ partId, withActions = false }) {
  return usePdfUrls(partId).map((d) => (
    <React.Fragment key={d.id}>
      <PdfThumbnail previewUrl={d.url} onClick={() => window.open(d.url, '_blank')} />
      {withActions && <PrintActions fileId={d.id} filename={d.filename} kind="drawing" />}
    </React.Fragment>
  ));
}

export default function PartRow({ part, jobId, actions, onUnstar, onChanged = () => {} }) {
  const hasPrice = part.price != null;
  const id = part.job_part_id;

  return (
    <div className="ov-prow">
      <div className="draw">
        <DrawingThumb partId={part.part_id} />
      </div>
      <div className="facts">
        <div className="pn">{part.number}<small>{part.rev}</small></div>
        <div className="ds">{part.description}</div>
        <div className="mt">{[part.material, part.finish].filter(Boolean).join(' · ')}</div>
        <div className="px">
          {hasPrice ? `${part.quantity} × ${money(part.price)} = ${money(part.quantity * part.price)}` : `Qty ${part.quantity}`}
        </div>
        <div className="links">
          <button type="button" onClick={() => onUnstar(id)}>Unstar</button>
        </div>
      </div>
      <div className="stage">
        <StageControl
          status={part.status}
          urgent={part.urgent}
          waiting={part.waiting}
          since={sinceText(part.since)}
          onSetStatus={(status) => actions.setStage(id, status)}
          onSetFlag={(flag, on) => actions.setFlag(id, flag, on)}
        />
      </div>
      <div className="acts">
        <button type="button" className="fin" onClick={() => actions.finish(id)}>Finish → Done</button>
        <PartNotes jobId={jobId} partId={part.part_id} notes={part.notes} onChanged={onChanged} />
        <NfcPair jobPartId={id} paired={part.paired} onChanged={onChanged} />
      </div>
    </div>
  );
}
