import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';
import StageControl, { useIsPhone } from '../Overview/StageControl';
import { chipText } from '../Overview/overviewStages';
import useStageActions from '../Overview/useStageActions';
import { DrawingThumb } from '../Overview/PartRow';
import PartDrawingStrip from './PartDrawingStrip';
import AddPart from '../AdminComponents/AddPart';
import '../Overview/overview.css';
import './jobParts.css';

const PRICE_LEVEL = 2;
const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const sinceText = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export default function JobParts({ jobId, job, parts, setParts, stages, accessLevel, onStagesChanged, onJobChanged }) {
  const navigate = useNavigate();
  const isPhone = useIsPhone();
  const [partEdits, setPartEdits] = useState({}); // job_part_id -> edited API fields
  const [editingIds, setEditingIds] = useState(new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [updateAllResult, setUpdateAllResult] = useState(null);
  const [showAddPartModal, setShowAddPartModal] = useState(false);
  const actions = useStageActions((jobPartId, patch) => onStagesChanged(jobPartId, patch));
  const { toast, dismiss } = actions;
  const stageByPart = new Map(stages.map((s) => [s.job_part_id, s]));

  const toggleEditing = (jobPartId) => setEditingIds((prev) => {
    const next = new Set(prev);
    if (!next.delete(jobPartId)) next.add(jobPartId);
    return next;
  });

  const recordEdit = (part, field, value) => {
    if (field === 'price' && accessLevel < 2) return;
    setPartEdits((prev) => ({
      ...prev,
      [part.job_part_id]: { ...prev[part.job_part_id], [field]: value },
    }));
  };

  const handlePartAdded = (newPart) => {
    setParts((prev) => [...prev, newPart]);
  };

  const handleRemovePart = async (partId) => {
    try {
      const res = await apiFetch('/internal/job/jobpartremove', {
        method: 'DELETE',
        body: { jobId, partId },
      });
      const data = await res.json();
      if (res.status === 200) {
        alert('Part removed successfully!');
        setParts((prev) => prev.filter((part) => part.id !== partId));
      } else {
        console.error(data);
        alert('Failed to remove part.');
      }
    } catch (e) {
      console.error(e);
      alert('Error occurred while removing part.');
    }
  };

  const handleUpdateAll = async () => {
    const payloadParts = Object.entries(partEdits).map(([jobPartId, edits]) => {
      const fields = { ...edits };
      if (accessLevel < 2) delete fields.price;
      return { job_part_id: Number(jobPartId), ...fields };
    });
    setIsSavingAll(true);
    try {
      const res = await apiFetch('/internal/job/updatejobparts', {
        method: 'POST',
        body: { jobId, parts: payloadParts },
      });
      const data = await res.json();
      if (res.status !== 200) {
        console.error(data);
        return alert('Failed to update parts.');
      }
      const savedIds = new Set(data.saved);
      setParts((prev) => prev.map((p) => (
        savedIds.has(p.job_part_id) ? { ...p, ...partEdits[p.job_part_id] } : p
      )));
      setPartEdits((prev) => Object.fromEntries(
        Object.entries(prev).filter(([jobPartId]) => !savedIds.has(Number(jobPartId)))
      ));
      setUpdateAllResult({ saved: data.saved.length, failed: data.failed });
    } catch (e) {
      console.error(e);
      alert('Error occurred while updating parts.');
    } finally {
      setIsSavingAll(false);
    }
  };

  const failedIds = new Set((updateAllResult?.failed || []).map((f) => f.job_part_id));

  const handleUpdateJobPartJoin = async (partId, newQuantity, newPrice, newRev, newDetails, newNote, newMaterial, newFinish, newStockSize, jobPartId) => {
    if (newQuantity <= 0) {
      return alert('Quantity must be greater than 0.');
    }
    try {
      const res = await apiFetch('/internal/job/updatejobpartjoin', {
        method: 'POST',
        body: {
          jobId,
          partId,
          quantity: newQuantity,
          price: newPrice,
          rev: newRev,
          details: newDetails,
          material: newMaterial,
          finish: newFinish,
          stock_size: newStockSize,
          note: newNote,
        },
      });
      const data = await res.json();
      if (res.status === 200) {
        alert('Part details updated successfully!');
        setPartEdits((prev) => {
          const { [jobPartId]: _saved, ...rest } = prev;
          return rest;
        });
        onJobChanged();
      } else {
        console.error(data);
        alert('Failed to update part details.');
      }
    } catch (e) {
      console.error(e);
      alert('Error occurred while updating part details.');
    }
  };

  const handleCosts = async () => {
    try {
      const res = await apiFetch('/internal/job/calculatecost', {
        method: 'POST',
        body: { jobId },
      });
      const data = await res.json();
      if (res.status === 200) {
        alert('Costs calculated successfully!');
        onJobChanged({ subtotal: data.subtotal, total_cost: data.total_cost });
      } else {
        console.error(data);
        alert('Failed to calculate costs.');
      }
    } catch (e) {
      console.error(e);
      alert('Error occurred while calculating costs.');
    }
  };

  const renderEdit = (part) => (
    <div className="jp-edit">
      <label>Rev<input type="text" defaultValue={part.rev} onChange={(e) => { part.newRev = e.target.value; recordEdit(part, 'rev', e.target.value); }} /></label>
      <label>Details<input type="text" defaultValue={part.details} onChange={(e) => { part.newDetails = e.target.value; recordEdit(part, 'details', e.target.value); }} /></label>
      <label>Material<input type="text" defaultValue={part.material} onChange={(e) => { part.newMaterial = e.target.value; recordEdit(part, 'material', e.target.value); }} /></label>
      <label>Finish<input type="text" defaultValue={part.finish} onChange={(e) => { part.newFinish = e.target.value; recordEdit(part, 'finish', e.target.value); }} /></label>
      <label>Stock size<input type="text" defaultValue={part.stock_size} onChange={(e) => { part.newStockSize = e.target.value; recordEdit(part, 'stock_size', e.target.value); }} /></label>
      <label>Quantity<input type="number" min="1" defaultValue={part.quantity} onChange={(e) => { part.newQuantity = parseInt(e.target.value, 10); recordEdit(part, 'quantity', e.target.value); }} /></label>
      {accessLevel >= 2 && (
        <label>Price<input type="number" step="0.01" defaultValue={part.price} onChange={(e) => { part.newPrice = parseFloat(e.target.value); recordEdit(part, 'price', e.target.value); }} /></label>
      )}
      <label className="wide">Note
        <textarea rows="3" defaultValue={part.note || ''} placeholder="Part note..." onChange={(e) => { part.newNote = e.target.value; recordEdit(part, 'note', e.target.value); }} />
      </label>
      <button
        type="button"
        onClick={() => handleUpdateJobPartJoin(
          part.id,
          part.newQuantity || part.quantity,
          part.newPrice || part.price,
          part.newRev || part.rev,
          part.newDetails || part.details,
          part.newNote !== undefined ? part.newNote : (part.note || null),
          part.newMaterial !== undefined ? part.newMaterial : part.material,
          part.newFinish !== undefined ? part.newFinish : part.finish,
          part.newStockSize !== undefined ? part.newStockSize : part.stock_size,
          part.job_part_id
        )}
      >
        Update
      </button>
    </div>
  );

  const renderStage = (part) => {
    const stage = stageByPart.get(part.job_part_id);
    if (!stage || !stage.starred) return <span className="jp-unstarred">Not starred</span>;
    const id = part.job_part_id;
    return (
      <StageControl
        status={stage.status}
        urgent={stage.urgent}
        waiting={stage.waiting}
        since={sinceText(stage.changed_at)}
        onSetStatus={(status) => actions.setStage(id, status)}
        onSetFlag={(flag, on) => actions.setFlag(id, flag, on)}
      />
    );
  };

  const renderActions = (part) => (
    <div className="jp-acts">
      <button type="button" onClick={() => navigate(`/part/${part.id}`)}>Open part</button>
      {accessLevel >= 1 && (
        <button type="button" onClick={() => toggleEditing(part.job_part_id)}>Edit part line</button>
      )}
      {accessLevel >= 3 && (
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (window.confirm(`Remove part "${part.number}" from this job?`)) handleRemovePart(part.id);
          }}
        >
          Remove
        </button>
      )}
    </div>
  );

  const renderPhoneCard = (part) => {
    const stage = stageByPart.get(part.job_part_id);
    const isStarred = Boolean(stage && stage.starred);
    return (
      <div key={part.job_part_id} className={`jp-part jp-pcard${failedIds.has(part.job_part_id) ? ' failed' : ''}`}>
        <div className="jp-pline">
          <span className="pn">{part.number}<small>{part.rev}</small></span>
          <span className="jp-chip">{isStarred ? chipText(stage.status) : 'Not starred'}</span>
        </div>
        <div className="ds">{part.description}</div>
        <div className="px">
          {accessLevel >= PRICE_LEVEL ? `${part.quantity} × ${money(part.price)} = ${money(part.quantity * part.price)}` : `Qty ${part.quantity}`}
        </div>
        <PartDrawingStrip partId={part.id} />
        {isStarred && renderStage(part)}
        {renderActions(part)}
        {editingIds.has(part.job_part_id) && renderEdit(part)}
      </div>
    );
  };

  return (
    <section className="jp-card">
      <header className="jp-head">
        <h2>Parts</h2>
        <div className="jp-tools">
          <button type="button" onClick={() => setShowAddPartModal(true)}>+ Add part</button>
          {accessLevel >= 2 && <button type="button" onClick={handleCosts}>Calculate costs</button>}
          {accessLevel >= 1 && (
            <button type="button" className="primary" disabled={isSavingAll || Object.keys(partEdits).length === 0} onClick={handleUpdateAll}>
              {isSavingAll ? 'Saving...' : 'Update all'}
            </button>
          )}
        </div>
      </header>
      {updateAllResult && (
        <div className="jp-result">
          <div>Saved {updateAllResult.saved} part{updateAllResult.saved === 1 ? '' : 's'}.</div>
          {updateAllResult.failed.map((f) => (
            <div key={f.job_part_id} className="bad">
              {parts.find((p) => p.job_part_id === f.job_part_id)?.number}: {f.error}
            </div>
          ))}
        </div>
      )}
      {parts.map((part) => (isPhone ? renderPhoneCard(part) : (
        <div key={part.job_part_id} className={`jp-part${failedIds.has(part.job_part_id) ? ' failed' : ''}`}>
          <div className="jp-draw"><DrawingThumb partId={part.id} withActions /></div>
          <div className="jp-facts">
            <div className="pn">{part.number}<small>{part.rev}</small></div>
            <div className="ds">{part.description}</div>
            <div className="mt">{[part.material, part.finish, part.stock_size].filter(Boolean).join(' · ')}</div>
            {accessLevel >= 2 && (
              <div className="px">{part.quantity} × {money(part.price)} = {money(part.quantity * part.price)}</div>
            )}
            {accessLevel < 2 && <div className="px">Qty {part.quantity}</div>}
          </div>
          <div className="jp-stage">{renderStage(part)}</div>
          {renderActions(part)}
          {editingIds.has(part.job_part_id) && renderEdit(part)}
        </div>
      )))}
      {accessLevel >= PRICE_LEVEL && (
      <footer className="jp-tot">
        <span>Subtotal <b>{money(job.subtotal ?? 0)}</b></span>
        <span>Tax <b>{money(job.tax ?? 0)}</b></span>
        <span>Total <b>{money(job.total_cost ?? 0)}</b></span>
      </footer>
      )}
      {toast && (
        <div className={`ov-toast ${toast.kind}`}>
          <span className="msg">
            {toast.message}
            {toast.undo && <> · <button type="button" onClick={toast.undo}>Undo</button></>}
          </span>
          <button type="button" className="x" aria-label="Dismiss" onClick={dismiss}>×</button>
        </div>
      )}
      {showAddPartModal && (
        <div className="jp-modal" onClick={() => setShowAddPartModal(false)}>
          <div className="jp-modal-box" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="jp-x" aria-label="Close" onClick={() => setShowAddPartModal(false)}>×</button>
            <AddPart
              jobId={jobId}
              onPartAdded={(newPart) => {
                handlePartAdded(newPart);
                setShowAddPartModal(false);
                onJobChanged();
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
