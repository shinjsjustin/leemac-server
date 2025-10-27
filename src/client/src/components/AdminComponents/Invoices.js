import React, { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from "../Navbar";
import { jwtDecode } from 'jwt-decode';
import '../Styling/RequestTable.css';

const Invoices = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;

    const [waitingInvoices, setWaitingInvoices] = useState([]);
    const [paidInvoices, setPaidInvoices] = useState([]);
    const [summary, setSummary] = useState({
        waiting: { count: 0, total_amount: 0 },
        paid: { count: 0, total_amount: 0 }
    });
    const [companies, setCompanies] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('');
    const [activeTab, setActiveTab] = useState('waiting');
    const [loading, setLoading] = useState(false);
    
    // Pagination state
    const [waitingHasMore, setWaitingHasMore] = useState(true);
    const [paidHasMore, setPaidHasMore] = useState(true);
    const [waitingOffset, setWaitingOffset] = useState(0);
    const [paidOffset, setPaidOffset] = useState(0);
    const observerRef = useRef();
    const lastInvoiceElementRef = useRef();

    const LIMIT = 35;

    const fetchCompanies = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/company/getcompanies`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                setCompanies(data);
            }
        } catch (e) {
            console.error('Error fetching companies:', e);
        }
    }, [token]);

    const fetchWaitingInvoices = useCallback(async (reset = false) => {
        if (loading) return;
        
        setLoading(true);
        const currentOffset = reset ? 0 : waitingOffset;

        try {
            let url = `${process.env.REACT_APP_URL}/internal/invoices/waiting?limit=${LIMIT}&offset=${currentOffset}`;
            if (selectedCompany) {
                url = `${process.env.REACT_APP_URL}/internal/invoices/waiting/company/${selectedCompany}?limit=${LIMIT}&offset=${currentOffset}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                if (reset) {
                    setWaitingInvoices(data.invoices);
                    setWaitingOffset(LIMIT);
                } else {
                    setWaitingInvoices(prev => [...prev, ...data.invoices]);
                    setWaitingOffset(prev => prev + LIMIT);
                }
                setWaitingHasMore(data.pagination.hasMore);
            } else {
                console.error('Failed to fetch waiting invoices:', data);
            }
        } catch (e) {
            console.error('Error fetching waiting invoices:', e);
        } finally {
            setLoading(false);
        }
    }, [token, selectedCompany, waitingOffset, loading]);

    const fetchPaidInvoices = useCallback(async (reset = false) => {
        if (loading) return;
        
        setLoading(true);
        const currentOffset = reset ? 0 : paidOffset;

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/invoices/paid?limit=${LIMIT}&offset=${currentOffset}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                if (reset) {
                    setPaidInvoices(data.invoices);
                    setPaidOffset(LIMIT);
                } else {
                    setPaidInvoices(prev => [...prev, ...data.invoices]);
                    setPaidOffset(prev => prev + LIMIT);
                }
                setPaidHasMore(data.pagination.hasMore);
            } else {
                console.error('Failed to fetch paid invoices:', data);
            }
        } catch (e) {
            console.error('Error fetching paid invoices:', e);
        } finally {
            setLoading(false);
        }
    }, [token, paidOffset, loading]);

    const fetchSummary = useCallback(async () => {
        try {
            let url = `${process.env.REACT_APP_URL}/internal/invoices/summary`;
            if (selectedCompany) {
                url = `${process.env.REACT_APP_URL}/internal/invoices/summary/company/${selectedCompany}`;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (response.status === 200) {
                setSummary(data);
            }
        } catch (e) {
            console.error('Error fetching summary:', e);
        }
    }, [token, selectedCompany]);

    useEffect(() => {
        fetchCompanies();
        fetchSummary();
        
        // Reset pagination and fetch invoices
        setWaitingInvoices([]);
        setPaidInvoices([]);
        setWaitingOffset(0);
        setPaidOffset(0);
        setWaitingHasMore(true);
        setPaidHasMore(true);
        
        fetchWaitingInvoices(true);
        fetchPaidInvoices(true);
    }, [fetchCompanies, fetchSummary, selectedCompany, token]);

    // Intersection Observer for infinite scrolling
    useEffect(() => {
        if (observerRef.current) observerRef.current.disconnect();

        const currentHasMore = activeTab === 'waiting' ? waitingHasMore : paidHasMore;
        
        if (!currentHasMore || loading) {
            return;
        }

        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !loading) {
                    if (activeTab === 'waiting' && waitingHasMore) {
                        fetchWaitingInvoices(false);
                    } else if (activeTab === 'paid' && paidHasMore) {
                        fetchPaidInvoices(false);
                    }
                }
            },
            { threshold: 0.1, rootMargin: '50px' }
        );

        if (lastInvoiceElementRef.current) {
            observerRef.current.observe(lastInvoiceElementRef.current);
        }

        return () => {
            if (observerRef.current) observerRef.current.disconnect();
        };
    }, [activeTab, waitingHasMore, paidHasMore, loading, fetchWaitingInvoices, fetchPaidInvoices]);

    const handleMarkAsPaid = async (jobId, invoiceNumber) => {
        if (!window.confirm(`Are you sure you want to mark Invoice #${invoiceNumber} as paid?`)) {
            return;
        }

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/invoices/markpaid`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId }),
            });

            if (response.status === 200) {
                alert('Invoice marked as paid successfully!');
                
                // Reset and refetch both lists
                setWaitingInvoices([]);
                setPaidInvoices([]);
                setWaitingOffset(0);
                setPaidOffset(0);
                setWaitingHasMore(true);
                setPaidHasMore(true);
                
                fetchWaitingInvoices(true);
                fetchPaidInvoices(true);
                fetchSummary();
            } else {
                const errorData = await response.json();
                alert(`Failed to mark invoice as paid: ${errorData.error}`);
            }
        } catch (e) {
            console.error('Error marking invoice as paid:', e);
            alert('Error occurred while marking invoice as paid');
        }
    };

    const handleMarkAsWaiting = async (jobId, invoiceNumber) => {
        if (!window.confirm(`Are you sure you want to mark Invoice #${invoiceNumber} as waiting?`)) {
            return;
        }

        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/invoices/markwaiting`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId }),
            });

            if (response.status === 200) {
                alert('Invoice marked as waiting successfully!');
                
                // Reset and refetch both lists
                setWaitingInvoices([]);
                setPaidInvoices([]);
                setWaitingOffset(0);
                setPaidOffset(0);
                setWaitingHasMore(true);
                setPaidHasMore(true);
                
                fetchWaitingInvoices(true);
                fetchPaidInvoices(true);
                fetchSummary();
            } else {
                const errorData = await response.json();
                alert(`Failed to mark invoice as waiting: ${errorData.error}`);
            }
        } catch (e) {
            console.error('Error marking invoice as waiting:', e);
            alert('Error occurred while marking invoice as waiting');
        }
    };

    const formatDate = (isoString) => {
        if (!isoString) return '—';
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    };

    const renderInvoiceTable = (invoices, isPaid = false) => (
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
                    const isLastInvoice = index === invoices.length - 1;
                    const currentHasMore = activeTab === 'waiting' ? waitingHasMore : paidHasMore;
                    
                    return (
                        <tr 
                            key={invoice.id} 
                            className='table-row'
                            ref={isLastInvoice && currentHasMore ? lastInvoiceElementRef : null}
                        >
                            <td>{invoice.job_number}</td>
                            <td>{invoice.company_name}</td>
                            <td>{invoice.attention || '—'}</td>
                            <td>{invoice.po_number || '—'}</td>
                            <td>{invoice.invoice_number}</td>
                            <td>{formatDate(invoice.invoice_date)}</td>
                            <td>{formatCurrency(invoice.total_cost)}</td>
                            <td>
                                {accessLevel >= 2 && (
                                    isPaid ? (
                                        <button 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleMarkAsWaiting(invoice.id, invoice.invoice_number);
                                            }}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: '#ffc107',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            Mark Waiting
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleMarkAsPaid(invoice.id, invoice.invoice_number);
                                            }}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: '#28a745',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
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
    );

    return (
        <div>
            <Navbar />
            <div className='requests' style={{ padding: '20px' }}>
                <h2>Invoice Management</h2>
                
                {/* Summary Cards */}
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                    gap: '20px', 
                    marginBottom: '30px' 
                }}>
                    <div style={{
                        backgroundColor: '#fff3cd',
                        border: '1px solid #ffeaa7',
                        borderRadius: '8px',
                        padding: '20px',
                        textAlign: 'center'
                    }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#856404' }}>
                            Waiting Invoices
                            {selectedCompany && (
                                <div style={{ fontSize: '14px', fontWeight: 'normal', marginTop: '5px' }}>
                                    ({companies.find(c => c.id == selectedCompany)?.name})
                                </div>
                            )}
                        </h3>
                        <p style={{ margin: '5px 0', fontSize: '24px', fontWeight: 'bold', color: '#856404' }}>
                            {summary.waiting.count}
                        </p>
                        <p style={{ margin: '5px 0', fontSize: '18px', color: '#856404' }}>
                            {formatCurrency(summary.waiting.total_amount)}
                        </p>
                    </div>
                    
                    <div style={{
                        backgroundColor: '#d4edda',
                        border: '1px solid #c3e6cb',
                        borderRadius: '8px',
                        padding: '20px',
                        textAlign: 'center'
                    }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#155724' }}>
                            Paid Invoices
                            {selectedCompany && (
                                <div style={{ fontSize: '14px', fontWeight: 'normal', marginTop: '5px' }}>
                                    ({companies.find(c => c.id == selectedCompany)?.name})
                                </div>
                            )}
                        </h3>
                        <p style={{ margin: '5px 0', fontSize: '24px', fontWeight: 'bold', color: '#155724' }}>
                            {summary.paid.count}
                        </p>
                        <p style={{ margin: '5px 0', fontSize: '18px', color: '#155724' }}>
                            {formatCurrency(summary.paid.total_amount)}
                        </p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div style={{ marginBottom: '20px' }}>
                    <button
                        onClick={() => setActiveTab('waiting')}
                        style={{
                            padding: '10px 20px',
                            marginRight: '10px',
                            backgroundColor: activeTab === 'waiting' ? '#007bff' : '#f8f9fa',
                            color: activeTab === 'waiting' ? 'white' : '#333',
                            border: '1px solid #007bff',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Waiting Invoices
                    </button>
                    <button
                        onClick={() => setActiveTab('paid')}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: activeTab === 'paid' ? '#007bff' : '#f8f9fa',
                            color: activeTab === 'paid' ? 'white' : '#333',
                            border: '1px solid #007bff',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Paid Invoices
                    </button>
                </div>

                {/* Company Filter (only for waiting invoices) */}
                {activeTab === 'waiting' && (
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Filter by Company:</label>
                        <select
                            value={selectedCompany}
                            onChange={(e) => setSelectedCompany(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                marginRight: '10px'
                            }}
                        >
                            <option value="">All Companies</option>
                            {companies.map((company) => (
                                <option key={company.id} value={company.id}>
                                    {company.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                        Loading invoices...
                    </div>
                )}

                {/* Invoice Tables */}
                <>
                    {activeTab === 'waiting' && (
                        <div>
                            <h3>Waiting Invoices {selectedCompany && `- ${companies.find(c => c.id == selectedCompany)?.name}`}</h3>
                            {waitingInvoices.length === 0 && !loading ? (
                                <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                                    No waiting invoices found
                                </p>
                            ) : (
                                <>
                                    {renderInvoiceTable(waitingInvoices, false)}
                                    {loading && (
                                        <div style={{ textAlign: 'center', padding: '20px' }}>
                                            Loading more invoices...
                                        </div>
                                    )}
                                    {!waitingHasMore && waitingInvoices.length > 0 && (
                                        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                            No more waiting invoices to load
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'paid' && (
                        <div>
                            <h3>Paid Invoices</h3>
                            {paidInvoices.length === 0 && !loading ? (
                                <p style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                                    No paid invoices found
                                </p>
                            ) : (
                                <>
                                    {renderInvoiceTable(paidInvoices, true)}
                                    {loading && (
                                        <div style={{ textAlign: 'center', padding: '20px' }}>
                                            Loading more invoices...
                                        </div>
                                    )}
                                    {!paidHasMore && paidInvoices.length > 0 && (
                                        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                            No more paid invoices to load
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </>
            </div>
        </div>
    );
};

export default Invoices;
