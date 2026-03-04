import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from "../Navbar";
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import '../Styling/RequestTable.css';

// periodId  – the financial_period.id to scope this view to
// periodLabel – display name e.g. "Q1 2025"
const Invoices = ({ periodId, periodLabel }) => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;
    const navigate = useNavigate();

    const [invoices, setInvoices] = useState([]);
    const [activeTab, setActiveTab] = useState('waiting');
    const [loading, setLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [offset, setOffset] = useState(0);

    const observerRef = useRef();
    const lastRowRef = useRef();
    const LIMIT = 35;

    // ── Fetch invoices for this period ────────────────────────────────────────
    const fetchInvoices = useCallback(async (currentOffset) => {
        if (loading || !periodId) return;
        setLoading(true);
        try {
            const res = await fetch(
                `${process.env.REACT_APP_URL}/internal/finances/periods/${periodId}/invoices?limit=${LIMIT}&offset=${currentOffset}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await res.json();
            if (res.ok) {
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
    }, [loading, periodId, activeTab, token]);

    // Reset + reload when period or tab changes
    useEffect(() => {
        setInvoices([]);
        setOffset(0);
        setHasMore(true);
    }, [periodId, activeTab]);

    useEffect(() => {
        if (!periodId) return;
        fetchInvoices(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [periodId, activeTab]);

    // ── Infinite scroll ───────────────────────────────────────────────────────
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

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div>
            <Navbar />
            <div className='requests' style={{ padding: '20px' }}>
                <h2 style={{ marginBottom: '8px' }}>Invoices</h2>
                {periodLabel && (
                    <p style={{ color: '#666', marginBottom: '20px' }}>{periodLabel}</p>
                )}

                {/* Tab Switcher */}
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
                                cursor: 'pointer'
                            }}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)} Invoices
                        </button>
                    ))}
                </div>

                {/* Invoice Table */}
                {invoices.length === 0 && !loading ? (
                    <p style={{ textAlign: 'center', color: '#666', padding: '30px' }}>
                        No {activeTab} invoices{periodLabel ? ` for ${periodLabel}` : ''}.
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
                                                        style={{ padding: '6px 12px', backgroundColor: '#ffc107', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                                                    >
                                                        Mark Waiting
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={e => { e.preventDefault(); e.stopPropagation(); handleMarkAsPaid(invoice.id, invoice.invoice_number); }}
                                                        style={{ padding: '6px 12px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
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

export default Invoices;
