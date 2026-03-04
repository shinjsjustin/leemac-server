import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from "../Navbar";
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import '../Styling/RequestTable.css';

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

    // Pagination
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 35;
    const observerRef = useRef();
    const lastRowRef = useRef();

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
    }, [fetchOverview]);

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

    if (periods.length === 0) {
        return (
            <div>
                <Navbar />
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                    No financial periods found. Create one to get started.
                </div>
            </div>
        );
    }

    return (
        <div>
            <Navbar />
            <div className='requests' style={{ padding: '20px' }}>
                <h2 style={{ marginBottom: '24px' }}>Finances</h2>

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

export default Finances;
