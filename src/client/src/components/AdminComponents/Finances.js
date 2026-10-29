import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { apiFetch } from '../../api/apiFetch';
import AdminLayout from '../AdminLayout/AdminLayout';
import FinanceHeadline from '../FinancesPage/FinanceHeadline';
import FinanceInvoices from '../FinancesPage/FinanceInvoices';
import FinanceExpenses from '../FinancesPage/FinanceExpenses';
import { CreatePeriodModal, CreateExpenseModal, AddInvoiceRangeModal } from '../FinancesPage/FinanceModals';
import '../FinancesPage/finances.css';

const EDIT_ACCESS_LEVEL = 2;
const SCROLL_HASHES = ['#invoices', '#expenses'];

async function readError(res) {
  const body = await res.json().catch(() => ({}));
  return body.error;
}

export default function Finances() {
  const token = localStorage.getItem('token');
  const accessLevel = (token && jwtDecode(token).access) || 0;
  const canEdit = accessLevel >= EDIT_ACCESS_LEVEL;
  const { hash } = useLocation();

  const [periods, setPeriods] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const loadPeriods = useCallback(async () => {
    try {
      const [overviewRes, currentRes] = await Promise.all([
        apiFetch('/internal/finances/overview'),
        apiFetch('/internal/finances/currentfinancialperiod'),
      ]);
      const loaded = overviewRes.ok ? (await overviewRes.json()).periods : [];
      const current = currentRes.ok ? (await currentRes.json()).current_financial_period_id : null;
      setPeriods(loaded);
      setCurrentId(current);
      // Overview is newest first, so [0] is the fallback when no period is current.
      setActiveId((prev) => {
        if (loaded.some((p) => p.id === prev)) return prev;
        return (loaded.find((p) => p.id === current) || loaded[0])?.id ?? null;
      });
    } catch (e) {
      console.error('Error loading finances:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  useEffect(() => {
    if (isLoading || !SCROLL_HASHES.includes(hash)) return;
    document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [isLoading, hash]);

  const period = periods.find((p) => p.id === activeId) || null;

  const setCurrentPeriod = async () => {
    if (!window.confirm(`Set ${period.lable} as the current financial period? New invoices will automatically be assigned to this period.`)) return;
    try {
      const res = await apiFetch('/internal/finances/updatefinancialperiod', { method: 'POST', body: { periodId: period.id } });
      if (!res.ok) return alert(`Failed to set current period: ${await readError(res)}`);
      alert(`${period.lable} is now the current financial period`);
      setCurrentId(period.id);
    } catch (e) {
      console.error('Error setting current period:', e);
      alert('Error occurred while setting current period.');
    }
  };

  const clearInvoices = async () => {
    if (!window.confirm(`Are you sure you want to clear ALL invoices from ${period.lable}? This action cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/internal/finances/periods/${period.id}/jobs`, { method: 'DELETE' });
      if (!res.ok) return alert(`Failed to clear invoices: ${await readError(res)}`);
      const data = await res.json();
      alert(`Successfully cleared ${data.cleared_count} invoice(s) from ${period.lable}`);
      await loadPeriods();
      bump();
    } catch (e) {
      console.error('Error clearing invoices:', e);
      alert('Error occurred while clearing invoices.');
    }
  };

  const onModalDone = async () => {
    setModal(null);
    await loadPeriods();
    bump();
  };

  const actions = canEdit && (
    <div className="fin-actions">
      {period && (
        <>
          <button type="button" onClick={() => setModal('range')}>+ Add invoices by range</button>
          <button type="button" onClick={() => setModal('expense')}>+ Create expense</button>
          <button type="button" disabled={currentId === period.id} onClick={setCurrentPeriod}>Set current period</button>
          <button type="button" className="danger" onClick={clearInvoices}>Clear all invoices</button>
        </>
      )}
      <button type="button" onClick={() => setModal('period')}>+ Create period</button>
    </div>
  );

  return (
    <AdminLayout current="finances" crumb="Finances" actions={actions}>
      {modal === 'period' && <CreatePeriodModal token={token} onClose={() => setModal(null)} onCreated={onModalDone} />}
      {modal === 'expense' && <CreateExpenseModal token={token} period={period} onClose={() => setModal(null)} onCreated={onModalDone} />}
      {modal === 'range' && <AddInvoiceRangeModal token={token} period={period} onClose={() => setModal(null)} onAdded={onModalDone} />}
      {isLoading && <p className="fin-empty">Loading financial periods…</p>}
      {!isLoading && !period && <p className="fin-empty">No financial periods</p>}
      {period && (
        <>
          <FinanceHeadline periods={periods} period={period} onSelect={(p) => setActiveId(p.id)} refreshKey={refreshKey} />
          <div className="fin-grid">
            <FinanceInvoices period={period} onChanged={bump} refreshKey={refreshKey} canEdit={canEdit} />
            <FinanceExpenses period={period} onCreate={() => setModal('expense')} refreshKey={refreshKey} canEdit={canEdit} />
          </div>
        </>
      )}
    </AdminLayout>
  );
}
