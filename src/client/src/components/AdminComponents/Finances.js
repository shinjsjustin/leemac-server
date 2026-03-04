import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from "../Navbar";
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import '../Styling/RequestTable.css';

// ── Create Period Modal ───────────────────────────────────────────────────────
const CreatePeriodModal = ({ token, onClose, onCreated }) => {
    const currentYear = new Date().getFullYear();
    const [form, setForm] = useState({
        lable: '',
        quarter: '1',
        year: String(currentYear),
        start_date: '',
        end_date: '',
    });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Auto-fill label when quarter/year changes
    useEffect(() => {
        setForm(prev => ({ ...prev, lable: `Q${prev.quarter} ${prev.year}` }));
    }, [form.quarter, form.year]);

    // Auto-fill start/end dates when quarter/year changes
    useEffect(() => {
        const q = Number(form.quarter);
        const y = Number(form.year);
        if (!q || !y) return;
        const quarterStartMonth = (q - 1) * 3; // 0-indexed month
        const start = new Date(y, quarterStartMonth, 1);
        const end = new Date(y, quarterStartMonth + 3, 0); // last day of last month in quarter
        const fmt = (d) => d.toISOString().split('T')[0];
        setForm(prev => ({ ...prev, start_date: fmt(start), end_date: fmt(end) }));
    }, [form.quarter, form.year]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/finances/periods`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lable: form.lable,
                    quarter: Number(form.quarter),
                    year: Number(form.year),
                    start_date: form.start_date,
                    end_date: form.end_date,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to create financial period');
            } else {
                onCreated(data.period);
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0 }}>Create Financial Period</h3>
                    <button onClick={onClose} style={closeBtnStyle}>✕</button>
                </div>

                {error && (
                    <div style={{ backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24', padding: '10px 14px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div style={rowStyle}>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Quarter</label>
                            <select name="quarter" value={form.quarter} onChange={handleChange} style={inputStyle} required>
                                <option value="1">Q1</option>
                                <option value="2">Q2</option>
                                <option value="3">Q3</option>
                                <option value="4">Q4</option>
                            </select>
                        </div>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Year</label>
                            <select name="year" value={form.year} onChange={handleChange} style={inputStyle} required>
                                {Array.from({ length: 6 }, (_, i) => currentYear - 2 + i).map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Label</label>
                        <input
                            name="lable"
                            value={form.lable}
                            onChange={handleChange}
                            style={inputStyle}
                            placeholder="e.g. Q1 2025"
                            required
                        />
                    </div>

                    <div style={rowStyle}>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Start Date</label>
                            <input
                                type="date"
                                name="start_date"
                                value={form.start_date}
                                onChange={handleChange}
                                style={inputStyle}
                                required
                            />
                        </div>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>End Date</label>
                            <input
                                type="date"
                                name="end_date"
                                value={form.end_date}
                                onChange={handleChange}
                                style={inputStyle}
                                required
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                        <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
                        <button type="submit" disabled={submitting} style={submitBtnStyle(submitting)}>
                            {submitting ? 'Creating…' : 'Create Period'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Add Invoice Range Modal ───────────────────────────────────────────────────
const AddInvoiceRangeModal = ({ token, period, onClose, onAdded }) => {
    const [form, setForm] = useState({ invoice_from: '', invoice_to: '' });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setResult(null);

        const from = Number(form.invoice_from);
        const to = Number(form.invoice_to);

        if (!from || !to) {
            setError('Both invoice numbers are required.');
            return;
        }
        if (from > to) {
            setError('Starting invoice number must be less than or equal to the ending invoice number.');
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch(
                `${process.env.REACT_APP_URL}/internal/finances/periods/${period.id}/jobs/range`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ invoice_from: from, invoice_to: to }),
                }
            );
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to add invoices.');
            } else {
                setResult(data.results);
            }
        } catch (err) {
            setError('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDone = () => {
        onAdded();
        onClose();
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Add Invoices by Range</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
                            Adding to: <strong>{period.lable}</strong>
                        </p>
                    </div>
                    <button onClick={onClose} style={closeBtnStyle}>✕</button>
                </div>

                {error && (
                    <div style={{ backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', color: '#721c24', padding: '10px 14px', borderRadius: '4px', marginBottom: '16px', fontSize: '14px' }}>
                        {error}
                    </div>
                )}

                {/* Results summary shown after a successful submission */}
                {result ? (
                    <div>
                        <div style={{ backgroundColor: '#d4edda', border: '1px solid #c3e6cb', color: '#155724', padding: '14px', borderRadius: '6px', marginBottom: '16px' }}>
                            <strong>Assignment complete</strong>
                            <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', fontSize: '14px' }}>
                                <li>{result.assigned.length} invoice{result.assigned.length !== 1 ? 's' : ''} added</li>
                                {result.skipped.length > 0 && <li>{result.skipped.length} already assigned (skipped)</li>}
                                {result.failed.length > 0 && <li style={{ color: '#721c24' }}>{result.failed.length} failed</li>}
                            </ul>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleDone} style={submitBtnStyle(false)}>Done</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <p style={{ fontSize: '14px', color: '#555', marginTop: 0, marginBottom: '16px' }}>
                            Enter a range of invoice numbers to add all matching jobs to this quarter.
                            Invoices already assigned to this period will be skipped.
                        </p>
                        <div style={rowStyle}>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>From Invoice #</label>
                                <input
                                    type="number"
                                    name="invoice_from"
                                    value={form.invoice_from}
                                    onChange={handleChange}
                                    style={inputStyle}
                                    placeholder="e.g. 100"
                                    min="1"
                                    required
                                />
                            </div>
                            <div style={fieldStyle}>
                                <label style={labelStyle}>To Invoice #</label>
                                <input
                                    type="number"
                                    name="invoice_to"
                                    value={form.invoice_to}
                                    onChange={handleChange}
                                    style={inputStyle}
                                    placeholder="e.g. 150"
                                    min="1"
                                    required
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                            <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
                            <button type="submit" disabled={submitting} style={submitBtnStyle(submitting)}>
                                {submitting ? 'Adding…' : 'Add Invoices'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

// ── Main Finances Component ───────────────────────────────────────────────────
const Finances = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;
    const navigate = useNavigate();

    const [periods, setPeriods] = useState([]);
    const [activePeriodIndex, setActivePeriodIndex] = useState(0);
    const [summary, setSummary] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [activeTab, setActiveTab] = useState('waiting');
    const [loading, setLoading] = useState(false);
    const [periodsLoading, setPeriodsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showRangeModal, setShowRangeModal] = useState(false);
    const [currentFinancialPeriodId, setCurrentFinancialPeriodId] = useState(null);

    // Pagination
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 35;
    const observerRef = useRef();
    const lastRowRef = useRef();

    // ── Fetch current financial period ────────────────────────────────────────
    const fetchCurrentFinancialPeriod = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/finances/currentfinancialperiod`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setCurrentFinancialPeriodId(data.current_financial_period_id);
            } else {
                setCurrentFinancialPeriodId(null);
            }
        } catch (e) {
            console.error('Failed to fetch current financial period:', e);
            setCurrentFinancialPeriodId(null);
        }
    }, [token]);

    // ── Fetch all periods on mount ────────────────────────────────────────────
    const fetchOverview = useCallback(async () => {
        setPeriodsLoading(true);
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/finances/overview`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (res.ok) {
                // overview returns newest first; keep that order
                setPeriods(data.periods);
                setActivePeriodIndex(0);
            }
        } catch (e) {
            console.error('Error fetching finances overview:', e);
        } finally {
            setPeriodsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchOverview();
        fetchCurrentFinancialPeriod();
    }, [fetchOverview, fetchCurrentFinancialPeriod]);

    // ── Whenever the active period or tab changes, reset invoices ────────────
    useEffect(() => {
        if (periods.length === 0) return;
        setInvoices([]);
        setOffset(0);
        setHasMore(true);
    }, [activePeriodIndex, activeTab, periods.length]);

    // ── Fetch invoices for the active period ─────────────────────────────────
    const fetchInvoices = useCallback(async (currentOffset) => {
        if (loading || periods.length === 0) return;
        const period = periods[activePeriodIndex];
        setLoading(true);
        try {
            const res = await fetch(
                `${process.env.REACT_APP_URL}/internal/finances/periods/${period.id}/invoices?limit=${LIMIT}&offset=${currentOffset}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (res.ok) {
                // Filter client-side by tab status
                const filtered = data.invoices.filter(inv => inv.invoice_status === activeTab);
                setInvoices(prev => currentOffset === 0 ? filtered : [...prev, ...filtered]);
                setHasMore(data.pagination.hasMore);
                setOffset(currentOffset + LIMIT);
            }
        } catch (e) {
            console.error('Error fetching invoices:', e);
        } finally {
            setLoading(false);
        }
    }, [loading, periods, activePeriodIndex, activeTab, token]);

    // Trigger initial load when reset happens (offset back to 0)
    const didReset = useRef(false);
    useEffect(() => {
        if (periods.length === 0) return;
        // fetchInvoices is stable enough; use a flag to avoid double-fire
        didReset.current = true;
        fetchInvoices(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePeriodIndex, activeTab, periods.length]);

    // ── Intersection Observer for infinite scroll ─────────────────────────────
    useEffect(() => {
        if (observerRef.current) observerRef.current.disconnect();
        if (!hasMore || loading) return;

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !loading && hasMore) {
                    fetchInvoices(offset);
                }
            },
            { threshold: 0.1, rootMargin: '50px' }
        );

        if (lastRowRef.current) observerRef.current.observe(lastRowRef.current);

        return () => { if (observerRef.current) observerRef.current.disconnect(); };
    }, [hasMore, loading, fetchInvoices, offset]);

    // ── Mark paid / waiting ───────────────────────────────────────────────────
    const handleMarkAsPaid = async (jobId, invoiceNumber) => {
        if (!window.confirm(`Mark Invoice #${invoiceNumber} as paid?`)) return;
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/invoices/markpaid`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            if (res.ok) {
                setInvoices([]);
                setOffset(0);
                setHasMore(true);
                fetchInvoices(0);
                fetchOverview();
            } else {
                const err = await res.json();
                alert(`Failed: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleMarkAsWaiting = async (jobId, invoiceNumber) => {
        if (!window.confirm(`Mark Invoice #${invoiceNumber} as waiting?`)) return;
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/invoices/markwaiting`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId }),
            });
            if (res.ok) {
                setInvoices([]);
                setOffset(0);
                setHasMore(true);
                fetchInvoices(0);
                fetchOverview();
            } else {
                const err = await res.json();
                alert(`Failed: ${err.error}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    // ── Clear all invoices from period ───────────────────────────────────────
    const handleClearAllInvoices = async () => {
        if (!activePeriod) return;
        if (!window.confirm(`Are you sure you want to clear ALL invoices from ${activePeriod.lable}? This action cannot be undone.`)) return;
        
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/finances/periods/${activePeriod.id}/jobs`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            
            if (res.ok) {
                const data = await res.json();
                alert(`Successfully cleared ${data.cleared_count} invoice(s) from ${activePeriod.lable}`);
                await fetchOverview();
                setInvoices([]);
                setOffset(0);
                setHasMore(true);
                fetchInvoices(0);
            } else {
                const error = await res.json();
                alert(`Failed to clear invoices: ${error.error}`);
            }
        } catch (e) {
            console.error('Error clearing invoices:', e);
            alert('Error occurred while clearing invoices.');
        }
    };

    // ── Make current financial period ─────────────────────────────────────────
    const handleMakeCurrentPeriod = async () => {
        if (!activePeriod) return;
        if (!window.confirm(`Set ${activePeriod.lable} as the current financial period? New invoices will automatically be assigned to this period.`)) return;
        
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/finances/updatefinancialperiod`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ periodId: activePeriod.id }),
            });
            
            if (res.ok) {
                alert(`${activePeriod.lable} is now the current financial period`);
                setCurrentFinancialPeriodId(activePeriod.id);
            } else {
                const error = await res.json();
                alert(`Failed to set current period: ${error.error}`);
            }
        } catch (e) {
            console.error('Error setting current period:', e);
            alert('Error occurred while setting current period.');
        }
    };

    // ── Period created callback ───────────────────────────────────────────────
    const handlePeriodCreated = async (newPeriod) => {
        setShowCreateModal(false);
        await fetchOverview();
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    const formatDate = (iso) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    };

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);

    // ── Derived values ────────────────────────────────────────────────────────
    const activePeriod = periods[activePeriodIndex] ?? null;
    const activeSummary = activePeriod?.summary ?? null;

    const canGoBack = activePeriodIndex < periods.length - 1;   // older
    const canGoForward = activePeriodIndex > 0;                  // newer

    // ── Render ────────────────────────────────────────────────────────────────
    if (periodsLoading) {
        return (
            <div>
                <Navbar />
                <div style={{ padding: '40px', textAlign: 'center' }}>Loading financial periods…</div>
            </div>
        );
    }

    return (
        <div>
            <Navbar />
            {showCreateModal && (
                <CreatePeriodModal
                    token={token}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handlePeriodCreated}
                />
            )}
            {showRangeModal && activePeriod && (
                <AddInvoiceRangeModal
                    token={token}
                    period={activePeriod}
                    onClose={() => setShowRangeModal(false)}
                    onAdded={() => { fetchOverview(); setInvoices([]); setOffset(0); setHasMore(true); fetchInvoices(0); }}
                />
            )}
            <div className='requests' style={{ padding: '20px' }}>
                {/* ── Page Header ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ margin: 0 }}>Finances</h2>
                    {accessLevel >= 2 && (
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {periods.length > 0 && (
                                <>
                                    <button onClick={() => setShowRangeModal(true)} style={{ ...createBtnStyle, backgroundColor: '#28a745' }}>
                                        + Add Invoices by Range
                                    </button>
                                    <button 
                                        onClick={handleMakeCurrentPeriod}
                                        style={{
                                            ...createBtnStyle,
                                            backgroundColor: currentFinancialPeriodId === activePeriod?.id ? '#6c757d' : '#17a2b8'
                                        }}
                                        disabled={currentFinancialPeriodId === activePeriod?.id}
                                    >
                                        {currentFinancialPeriodId === activePeriod?.id ? '✓ Current Period' : 'Make Current Period'}
                                    </button>
                                    <button 
                                        onClick={handleClearAllInvoices}
                                        style={{ ...createBtnStyle, backgroundColor: '#dc3545' }}
                                    >
                                        Clear All Invoices
                                    </button>
                                </>
                            )}
                            <button onClick={() => setShowCreateModal(true)} style={createBtnStyle}>
                                + Create Financial Period
                            </button>
                        </div>
                    )}
                </div>

                {periods.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#666', padding: '60px 0' }}>
                        <p style={{ fontSize: '16px', marginBottom: '16px' }}>No financial periods found.</p>
                        {accessLevel >= 2 && (
                            <button onClick={() => setShowCreateModal(true)} style={createBtnStyle}>
                                + Create your first period
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {/* ── Quarter Navigator ── */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '24px',
                            marginBottom: '28px'
                        }}>
                            <button
                                onClick={() => setActivePeriodIndex(i => i + 1)}
                                disabled={!canGoBack}
                                title="Previous quarter"
                                style={arrowBtnStyle(!canGoBack)}
                            >
                                &#8592;
                            </button>

                            <div style={{ textAlign: 'center', minWidth: '200px' }}>
                                <div style={{ fontSize: '26px', fontWeight: 'bold', color: '#1a1a2e' }}>
                                    {activePeriod.lable}
                                </div>
                                <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
                                    {formatDate(activePeriod.start_date)} — {formatDate(activePeriod.end_date)}
                                </div>
                            </div>

                            <button
                                onClick={() => setActivePeriodIndex(i => i - 1)}
                                disabled={!canGoForward}
                                title="Next quarter"
                                style={arrowBtnStyle(!canGoForward)}
                            >
                                &#8594;
                            </button>
                        </div>

                        {/* ── Period Dots ── */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '28px' }}>
                            {periods.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActivePeriodIndex(i)}
                                    style={{
                                        width: '10px',
                                        height: '10px',
                                        borderRadius: '50%',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                        backgroundColor: i === activePeriodIndex ? '#007bff' : '#ccc',
                                        transition: 'background-color 0.2s'
                                    }}
                                />
                            ))}
                        </div>

                        {/* ── Summary Cards ── */}
                        {activeSummary && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '16px',
                                marginBottom: '28px'
                            }}>
                                <SummaryCard
                                    label="Waiting"
                                    count={activeSummary.waiting.count}
                                    amount={activeSummary.waiting.total_amount}
                                    bg="#fff3cd"
                                    border="#ffeaa7"
                                    color="#856404"
                                    formatCurrency={formatCurrency}
                                />
                                <SummaryCard
                                    label="Paid"
                                    count={activeSummary.paid.count}
                                    amount={activeSummary.paid.total_amount}
                                    bg="#d4edda"
                                    border="#c3e6cb"
                                    color="#155724"
                                    formatCurrency={formatCurrency}
                                />
                                <SummaryCard
                                    label="Total"
                                    count={activeSummary.combined.count}
                                    amount={activeSummary.combined.total_amount}
                                    bg="#cce5ff"
                                    border="#b8daff"
                                    color="#004085"
                                    formatCurrency={formatCurrency}
                                />
                                <SummaryCard
                                    label="Expenses"
                                    count={activeSummary.expenses.count}
                                    amount={activeSummary.expenses.total_amount}
                                    bg="#f8d7da"
                                    border="#f5c6cb"
                                    color="#721c24"
                                    formatCurrency={formatCurrency}
                                />
                            </div>
                        )}

                        {/* ── Tab Switcher ── */}
                        <div style={{ marginBottom: '16px' }}>
                            {['waiting', 'paid'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    style={{
                                        padding: '10px 22px',
                                        marginRight: '10px',
                                        backgroundColor: activeTab === tab ? '#007bff' : '#f8f9fa',
                                        color: activeTab === tab ? 'white' : '#333',
                                        border: '1px solid #007bff',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)} Invoices
                                </button>
                            ))}
                        </div>

                        {/* ── Invoice Table ── */}
                        {invoices.length === 0 && !loading ? (
                            <p style={{ textAlign: 'center', color: '#666', padding: '30px' }}>
                                No {activeTab} invoices for this period.
                            </p>
                        ) : (
                            <table className='requests-table'>
                                <thead>
                                    <tr>
                                        <th>Job #</th>
                                        <th>Company</th>
                                        <th>Attention</th>
                                        <th>PO #</th>
                                        <th>Invoice #</th>
                                        <th>Invoice Date</th>
                                        <th>Total Cost</th>
                                        <th>Total Expenses</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoices.map((invoice, index) => {
                                        const isLast = index === invoices.length - 1;
                                        return (
                                            <tr
                                                key={invoice.id}
                                                className='table-row'
                                                onClick={() => navigate(`/job/${invoice.id}`)}
                                                ref={isLast && hasMore ? lastRowRef : null}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <td>{invoice.job_number}</td>
                                                <td>{invoice.company_name}</td>
                                                <td>{invoice.attention || '—'}</td>
                                                <td>{invoice.po_number || '—'}</td>
                                                <td>{invoice.invoice_number}</td>
                                                <td>{formatDate(invoice.invoice_date)}</td>
                                                <td>{formatCurrency(invoice.total_cost)}</td>
                                                <td>{formatCurrency(invoice.total_expenses)}</td>
                                                <td onClick={e => e.stopPropagation()}>
                                                    {accessLevel >= 2 && (
                                                        activeTab === 'paid' ? (
                                                            <button
                                                                onClick={e => { e.preventDefault(); e.stopPropagation(); handleMarkAsWaiting(invoice.id, invoice.invoice_number); }}
                                                                style={actionBtnStyle('#ffc107')}
                                                            >
                                                                Mark Waiting
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={e => { e.preventDefault(); e.stopPropagation(); handleMarkAsPaid(invoice.id, invoice.invoice_number); }}
                                                                style={actionBtnStyle('#28a745')}
                                                            >
                                                                Mark Paid
                                                            </button>
                                                        )
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}

                        {loading && (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                Loading invoices…
                            </div>
                        )}
                        {!hasMore && invoices.length > 0 && (
                            <div style={{ textAlign: 'center', padding: '16px', color: '#aaa', fontSize: '13px' }}>
                                All invoices loaded
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const SummaryCard = ({ label, count, amount, bg, border, color, formatCurrency }) => (
    <div style={{
        backgroundColor: bg,
        border: `1px solid ${border}`,
        borderRadius: '8px',
        padding: '20px',
        textAlign: 'center'
    }}>
        <h3 style={{ margin: '0 0 8px 0', color, fontSize: '16px' }}>{label} Invoices</h3>
        <p style={{ margin: '4px 0', fontSize: '28px', fontWeight: 'bold', color }}>{count}</p>
        <p style={{ margin: '4px 0', fontSize: '18px', color }}>{formatCurrency(amount)}</p>
    </div>
);

// ── Style helpers ─────────────────────────────────────────────────────────────

const arrowBtnStyle = (disabled) => ({
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    border: '2px solid #007bff',
    backgroundColor: disabled ? '#e9ecef' : '#007bff',
    color: disabled ? '#aaa' : 'white',
    fontSize: '20px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    lineHeight: 1
});

const actionBtnStyle = (bg) => ({
    padding: '6px 12px',
    backgroundColor: bg,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px'
});

const createBtnStyle = {
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
};

const overlayStyle = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
};

const modalStyle = {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '28px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
};

const closeBtnStyle = {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#666',
    lineHeight: 1
};

const rowStyle = {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px'
};

const fieldStyle = {
    flex: 1
};

const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontWeight: '500',
    fontSize: '14px',
    color: '#333'
};

const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box'
};

const cancelBtnStyle = {
    padding: '10px 20px',
    backgroundColor: '#f8f9fa',
    color: '#333',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
};

const submitBtnStyle = (disabled) => ({
    padding: '10px 20px',
    backgroundColor: disabled ? '#6c757d' : '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '14px'
});

export default Finances;
