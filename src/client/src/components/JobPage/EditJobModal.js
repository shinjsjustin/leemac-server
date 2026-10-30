import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';

const TAX_EDIT_LEVEL = 2;

// Format a raw date/datetime value into the YYYY-MM-DD string an <input type="date"> expects.
const toDateInputValue = (value) => (value ? String(value).split('T')[0] : '');

// Format a raw datetime value into the YYYY-MM-DDTHH:mm string a datetime-local input expects.
const toDateTimeInputValue = (value) => (value ? String(value).slice(0, 16) : '');

const formFromJob = (job) => ({
  attention: job.attention || '',
  companyId: job.company_id != null ? String(job.company_id) : '',
  createdAt: toDateTimeInputValue(job.created_at),
  poNum: job.po_number || '',
  poDate: toDateInputValue(job.po_date),
  dueDate: toDateInputValue(job.due_date),
  taxCode: job.tax_code || '',
  tax: job.tax != null ? String(job.tax) : '',
  taxPercent: job.tax_percent != null ? String(job.tax_percent) : '',
  invoiceNumber: job.invoice_number || '',
  invoiceDate: toDateInputValue(job.invoice_date),
});

function Field({ label, form, onChange, name, type = 'text', step }) {
  return (
    <label className="jh-field">
      {label}
      <input type={type} step={step} name={name} value={form[name]} onChange={onChange} />
    </label>
  );
}

export default function EditJobModal({ job, jobId, accessLevel, onClose, onEdited }) {
  const [form, setForm] = useState(() => formFromJob(job));
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/internal/company/getcompanies');
        const data = await res.json();
        if (res.status === 200) setCompanies(data);
        else console.error(data);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleUpdateJobDetails = async (e) => {
    e.preventDefault();
    try {
      // Convert the datetime-local value (YYYY-MM-DDTHH:mm) into a MySQL DATETIME string.
      const createdAt = form.createdAt ? `${form.createdAt.replace('T', ' ')}:00` : '';
      const body = {
        jobId,
        attention: form.attention,
        companyId: form.companyId,
        createdAt,
        poNum: form.poNum,
        poDate: form.poDate,
        dueDate: form.dueDate,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
      };
      if (accessLevel >= TAX_EDIT_LEVEL) {
        body.taxCode = form.taxCode;
        body.tax = form.tax;
        body.taxPercent = form.taxPercent;
      }
      const response = await apiFetch('/internal/job/updatedetails', { method: 'POST', body });
      const data = await response.json();
      if (response.status === 200) {
        alert('Job details updated successfully!');
        onEdited();
      } else {
        console.error(data);
        alert(typeof data.error === 'string' && data.error ? data.error : 'Failed to update job details.');
      }
    } catch (err) {
      console.error(err);
      alert('Error occurred while updating job details.');
    }
  };

  return (
    <div className="jh-overlay" onClick={onClose}>
      <div className="jh-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="jh-close" onClick={onClose} aria-label="Close">×</button>
        <h3>Edit Job Info</h3>
        <form onSubmit={handleUpdateJobDetails}>
          <div className="jh-form">
            <Field label="Attention" name="attention" form={form} onChange={handleChange} />
            <label className="jh-field">
              Company
              <select name="companyId" value={form.companyId} onChange={handleChange}>
                <option value="">— Select company —</option>
                {companies.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.name}{c.code ? ` (${c.code})` : ''}</option>
                ))}
              </select>
            </label>
            <Field label="Created" name="createdAt" type="datetime-local" form={form} onChange={handleChange} />
            <Field label="PO Number" name="poNum" form={form} onChange={handleChange} />
            <Field label="PO Date" name="poDate" type="date" form={form} onChange={handleChange} />
            <Field label="Due Date" name="dueDate" type="date" form={form} onChange={handleChange} />
            {accessLevel >= TAX_EDIT_LEVEL && (
              <>
                <Field label="Tax Code" name="taxCode" form={form} onChange={handleChange} />
                <Field label="Tax" name="tax" type="number" step="0.01" form={form} onChange={handleChange} />
                <Field label="Tax Percent" name="taxPercent" type="number" step="0.01" form={form} onChange={handleChange} />
              </>
            )}
            <Field label="Invoice Number" name="invoiceNumber" form={form} onChange={handleChange} />
            <Field label="Invoice Date" name="invoiceDate" type="date" form={form} onChange={handleChange} />
          </div>
          <button type="submit" className="jh-save">Save Changes</button>
        </form>
      </div>
    </div>
  );
}
