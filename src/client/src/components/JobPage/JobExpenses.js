import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../api/apiFetch';
import './jobBilling.css';

const EXPENSE_LEVEL = 3;
const EMPTY_EXPENSE = { description: '', vendor: '', amount: '', expense_date: '', category: '', notes: '' };
const money = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateOnly = (value) => (value ? String(value).split('T')[0] : '');

export default function JobExpenses({ jobId, job, accessLevel, onTotal }) {
  const [expenses, setExpenses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(EMPTY_EXPENSE);

  const fetchExpenses = useCallback(async () => {
    if (accessLevel < EXPENSE_LEVEL) return;
    try {
      const res = await apiFetch(`/internal/expenses/byjob/${jobId}`);
      if (!res.ok) return;
      const data = await res.json();
      setExpenses(data);
      onTotal(data.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0));
    } catch (e) {
      console.error('Error fetching expenses:', e);
    }
  }, [jobId, accessLevel, onTotal]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  if (accessLevel < EXPENSE_LEVEL) return null;

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

  const send = async (url, options, failMessage, errorMessage) => {
    try {
      const res = await apiFetch(url, options);
      if (!res.ok) {
        const data = await res.json();
        alert(`${failMessage}: ${data.error}`);
        return false;
      }
      return true;
    } catch (e) {
      console.error(e);
      alert(errorMessage);
      return false;
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const ok = await send('/internal/expenses/create', { method: 'POST', body: { ...draft, jobIds: [jobId] } }, 'Failed to create expense', 'Error creating expense.');
    if (!ok) return;
    setDraft(EMPTY_EXPENSE);
    setShowForm(false);
    fetchExpenses();
  };

  const handleUpdate = async (expense) => {
    const { description, vendor, amount, expense_date, category, notes } = expense;
    const ok = await send(`/internal/expenses/update/${expense.id}`, { method: 'PUT', body: { description, vendor, amount, expense_date, category, notes } }, 'Failed to update expense', 'Error updating expense.');
    if (ok) fetchExpenses();
  };

  const handleDelete = async (expenseId) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    const ok = await send(`/internal/expenses/delete/${expenseId}`, { method: 'DELETE' }, 'Failed to delete expense', 'Error deleting expense.');
    if (ok) fetchExpenses();
  };

  const handleFieldChange = (expenseId, field, value) => {
    setExpenses((prev) => prev.map((e) => (e.id === expenseId ? { ...e, [field]: value } : e)));
  };

  const draftInput = (name, placeholder, type = 'text', required = false) => (
    <input type={type} name={name} placeholder={placeholder} step={type === 'number' ? '0.01' : undefined} required={required} value={draft[name]} onChange={(e) => setDraft({ ...draft, [name]: e.target.value })} />
  );

  const rowInput = (expense, name, type = 'text') => (
    <input type={type} name={name} step={type === 'number' ? '0.01' : undefined} value={type === 'date' ? dateOnly(expense[name]) : expense[name] || ''} onChange={(e) => handleFieldChange(expense.id, name, e.target.value)} />
  );

  return (
    <section className="jb-card">
      <div className="jb-head">
        <h2>Expenses</h2>
        <button type="button" className="jb-tools" onClick={() => setShowForm((prev) => !prev)}>
          {showForm ? 'Cancel' : '+ Create expense'}
        </button>
      </div>
      {showForm && (
        <form className="jb-form" onSubmit={handleCreate}>
          {draftInput('description', 'Description *', 'text', true)}
          {draftInput('vendor', 'Vendor')}
          {draftInput('amount', 'Amount *', 'number', true)}
          {draftInput('expense_date', 'Date *', 'date', true)}
          {draftInput('category', 'Category')}
          {draftInput('notes', 'Notes')}
          <button type="submit" className="primary">Create</button>
        </form>
      )}
      {expenses.length === 0 ? (
        <p className="jb-empty">No expenses recorded for this job.</p>
      ) : (
        <table className="jb-table">
          <thead>
            <tr><th>Date</th><th>Vendor</th><th>Category</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {expenses.map((expense) => (
              <tr key={expense.id}>
                <td>{rowInput(expense, 'expense_date', 'date')}</td>
                <td>{rowInput(expense, 'vendor')}</td>
                <td>{rowInput(expense, 'category')}</td>
                <td>{rowInput(expense, 'amount', 'number')}</td>
                <td>
                  <button type="button" onClick={() => handleUpdate(expense)}>Save</button>
                  <button type="button" className="danger" onClick={() => handleDelete(expense.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={3}>Total expenses</td><td colSpan={2}>{money(total)}</td></tr>
            <tr><td colSpan={3}>Job total − expenses</td><td colSpan={2}>{money(Number(job.total_cost || 0) - total)}</td></tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}
