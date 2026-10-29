import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';
import './jobBilling.css';

const PO_EDIT_LEVEL = 2;
const INVOICE_LEVEL = 3;
const toDateInput = (value) => (value ? String(value).split('T')[0] : '');
const toText = (value) => (value == null ? '' : String(value));

const fromJob = (job) => ({
  poNum: toText(job.po_number),
  poDate: toDateInput(job.po_date),
  dueDate: toDateInput(job.due_date),
  taxCode: toText(job.tax_code),
  tax: toText(job.tax),
  taxPercent: toText(job.tax_percent),
});

export default function JobBilling({ jobId, job, accessLevel, onJobChanged }) {
  const [po, setPo] = useState(() => fromJob(job));
  useEffect(() => { setPo(fromJob(job)); }, [job]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPo((prev) => ({ ...prev, [name]: value }));
  };

  const post = async (url, body, okMessage, failMessage, errorMessage) => {
    try {
      const res = await apiFetch(url, { method: 'POST', body });
      const data = await res.json();
      if (res.status !== 200) {
        console.error(data);
        alert(failMessage);
        return;
      }
      alert(okMessage);
      onJobChanged();
    } catch (e) {
      console.error(e);
      alert(errorMessage);
    }
  };

  const handleUpdatePo = (e) => {
    e.preventDefault();
    return post('/internal/job/updatepo', { jobId, ...po }, 'PO updated successfully!', 'Failed to update PO.', 'Error occurred while updating PO.');
  };

  const handleUpdateInvoice = () => post(
    '/internal/job/updateinvoiceandincrement',
    { jobId },
    'Invoice updated and incremented successfully!',
    'Failed to update and increment invoice.',
    'Error occurred while updating and incrementing invoice.',
  );

  const input = (name, label, type = 'text') => (
    <label className="jb-field">
      <span>{label}</span>
      <input type={type} name={name} value={po[name]} onChange={handleChange} />
    </label>
  );

  const canEditPo = accessLevel >= PO_EDIT_LEVEL;
  const readOnly = (label, value) => (
    <div className="jb-field">
      <span>{label}</span>
      <b>{value || '—'}</b>
    </div>
  );

  return (
    <section className="jb-card">
      <div className="jb-head">
        <h2>PO / Billing</h2>
        {accessLevel >= INVOICE_LEVEL && (
          <button type="button" className="jb-tools" onClick={handleUpdateInvoice}>Update invoice</button>
        )}
      </div>
      {canEditPo ? (
      <form className="jb-form" onSubmit={handleUpdatePo}>
        {input('poNum', 'PO number')}
        {input('poDate', 'PO date', 'date')}
        {input('dueDate', 'Due date', 'date')}
        {input('taxCode', 'Tax code')}
        {input('tax', 'Tax', 'number')}
        {input('taxPercent', 'Tax %', 'number')}
        <button type="submit" className="primary">Save</button>
      </form>
      ) : (
        <div className="jb-form">
          {readOnly('PO number', po.poNum)}
          {readOnly('PO date', po.poDate)}
          {readOnly('Due date', po.dueDate)}
        </div>
      )}
    </section>
  );
}
