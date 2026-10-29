import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';
import './financeLists.css';

const PAGE_SIZE = 100;
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
const formatDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: 'UTC' });

async function fetchAllExpenses(periodId) {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await apiFetch(`/internal/finances/periods/${periodId}/expenses?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) return all;
    const data = await res.json();
    all.push(...data.expenses);
    if (!data.pagination?.hasMore) return all;
  }
}

export default function FinanceExpenses({ period, onCreate }) {
  const [expenses, setExpenses] = useState([]);
  const periodId = period.id;

  useEffect(() => {
    let isCurrent = true;
    fetchAllExpenses(periodId).then((rows) => { if (isCurrent) setExpenses(rows); });
    return () => { isCurrent = false; };
  }, [periodId]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <section id="expenses" className="fl">
      <div className="fl-head">
        <h2>Period expenses</h2>
        <button type="button" className="fl-create" onClick={onCreate}>+ Create expense</button>
      </div>
      {expenses.length === 0 && <p className="fl-empty">No expenses for this period.</p>}
      <table>
        <thead><tr><th>Date</th><th>Vendor · description</th><th>Job</th><th>Amount</th></tr></thead>
        <tbody>
          {expenses.map((e) => (
            <tr key={e.id}>
              <td>{formatDate(e.expense_date)}</td>
              <td>{e.vendor ? `${e.vendor} · ${e.description}` : e.description}</td>
              <td>
                {(e.jobs || []).map((j) => <Link key={j.job_id} to={`/job/${j.job_id}`}>{j.job_number}</Link>)}
              </td>
              <td>{money(e.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan="3">Total</td><td>{money(total)}</td></tr></tfoot>
      </table>
    </section>
  );
}
