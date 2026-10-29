import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';
import './financeLists.css';

const PAGE_SIZE = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TABS = ['waiting', 'paid'];
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const formatDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });
const ageInDays = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY);

async function fetchAllInvoices(periodId) {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await apiFetch(`/internal/finances/periods/${periodId}/invoices?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) return all;
    const data = await res.json();
    all.push(...data.invoices);
    if (!data.pagination.hasMore) return all;
  }
}

// Companies ordered by their oldest invoice, invoices oldest first within each.
function groupByCompany(invoices) {
  const byDate = [...invoices].sort((a, b) => new Date(a.invoice_date) - new Date(b.invoice_date));
  const groups = new Map();
  byDate.forEach((inv) => {
    if (!groups.has(inv.company_name)) groups.set(inv.company_name, []);
    groups.get(inv.company_name).push(inv);
  });
  return [...groups];
}

export default function FinanceInvoices({ period, onChanged }) {
  const [invoices, setInvoices] = useState([]);
  const [tab, setTab] = useState('waiting');
  const periodId = period.id;

  const load = useCallback(async () => setInvoices(await fetchAllInvoices(periodId)), [periodId]);
  useEffect(() => { load(); }, [load]);

  const act = async (prompt, url, init, invoice) => {
    if (!window.confirm(`${prompt} invoice #${invoice.invoice_number}?`)) return;
    const res = await apiFetch(url, init);
    if (!res.ok) {
      const err = await res.json();
      window.alert(`Failed: ${err.error}`);
      return;
    }
    await load();
    onChanged();
  };
  const setStatus = (status, invoice) => act(
    status === 'paid' ? 'Mark paid' : 'Mark waiting',
    `/internal/invoices/${status === 'paid' ? 'markpaid' : 'markwaiting'}`,
    { method: 'POST', body: { jobId: invoice.id } },
    invoice,
  );
  const remove = (invoice) => act('Remove', `/internal/finances/periods/${periodId}/jobs/${invoice.id}`, { method: 'DELETE' }, invoice);

  const shown = invoices.filter((inv) => inv.invoice_status === tab);

  return (
    <section id="invoices" className="fl">
      <div className="fl-head">
        <h2>Invoices</h2>
        <div className="fl-tabs">
          {TABS.map((t) => (
            <button key={t} type="button" className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'waiting' ? 'Waiting' : 'Paid'} {invoices.filter((inv) => inv.invoice_status === t).length}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 && <p className="fl-empty">No {tab} invoices for this period.</p>}
      {groupByCompany(shown).map(([company, rows]) => (
        <div key={company} className="fl-group">
          <h3 className="fi-company">{company}</h3>
          <table>
            <thead>
              <tr><th>Invoice</th><th>Date</th><th>Age</th><th>Job</th><th>Attention</th><th>PO</th><th>Total</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoice_number}</td>
                  <td>{formatDate(inv.invoice_date)}</td>
                  <td>{ageInDays(inv.invoice_date)} days</td>
                  <td><Link to={`/job/${inv.id}`}>{inv.job_number}</Link></td>
                  <td>{inv.attention || '—'}</td>
                  <td>{inv.po_number || '—'}</td>
                  <td>{money(inv.total_cost)}</td>
                  <td className="fl-actions">
                    {tab === 'waiting'
                      ? <button type="button" onClick={() => setStatus('paid', inv)}>Mark paid</button>
                      : <button type="button" onClick={() => setStatus('waiting', inv)}>Mark waiting</button>}
                    <button type="button" className="danger" onClick={() => remove(inv)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
