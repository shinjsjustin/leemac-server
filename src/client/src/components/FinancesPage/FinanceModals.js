import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../api/apiFetch';

// ── Create Period Modal ───────────────────────────────────────────────────────
export const CreatePeriodModal = ({ token, onClose, onCreated }) => {
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
            const res = await apiFetch('/internal/finances/periods', {
                method: 'POST',
                body: {
                    lable: form.lable,
                    quarter: Number(form.quarter),
                    year: Number(form.year),
                    start_date: form.start_date,
                    end_date: form.end_date,
                },
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

// ── Create Expense Modal ──────────────────────────────────────────────────────
export const CreateExpenseModal = ({ token, period, onClose, onCreated }) => {
    const [form, setForm] = useState({
        description: '',
        vendor: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        category: '',
        notes: ''
    });
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        try {
            const response = await apiFetch('/internal/expenses/create', {
                method: 'POST',
                body: {
                    ...form,
                    amount: parseFloat(form.amount),
                    periodIds: [period.id]
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to create expense');
            }

            onCreated();
        } catch (err) {
            console.error('Error creating expense:', err);
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Create Expense</h3>
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

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Description *</label>
                        <input
                            name="description"
                            value={form.description}
                            onChange={handleChange}
                            style={inputStyle}
                            placeholder="e.g. Office supplies"
                            required
                        />
                    </div>

                    <div style={rowStyle}>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Vendor</label>
                            <input
                                name="vendor"
                                value={form.vendor}
                                onChange={handleChange}
                                style={inputStyle}
                                placeholder="e.g. Home Depot"
                            />
                        </div>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Amount *</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                name="amount"
                                value={form.amount}
                                onChange={handleChange}
                                style={inputStyle}
                                placeholder="0.00"
                                required
                            />
                        </div>
                    </div>

                    <div style={rowStyle}>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Date *</label>
                            <input
                                type="date"
                                name="expense_date"
                                value={form.expense_date}
                                onChange={handleChange}
                                style={inputStyle}
                                required
                            />
                        </div>
                        <div style={fieldStyle}>
                            <label style={labelStyle}>Category</label>
                            <select name="category" value={form.category} onChange={handleChange} style={inputStyle}>
                                <option value="">Select category</option>
                                <option value="supplies">Supplies</option>
                                <option value="equipment">Equipment</option>
                                <option value="travel">Travel</option>
                                <option value="materials">Materials</option>
                                <option value="utilities">Utilities</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Notes</label>
                        <textarea
                            name="notes"
                            value={form.notes}
                            onChange={handleChange}
                            style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                            placeholder="Additional notes..."
                        />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                        <button type="button" onClick={onClose} style={cancelBtnStyle}>Cancel</button>
                        <button type="submit" disabled={submitting} style={submitBtnStyle(submitting)}>
                            {submitting ? 'Creating…' : 'Create Expense'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ── Add Invoice Range Modal ───────────────────────────────────────────────────
export const AddInvoiceRangeModal = ({ token, period, onClose, onAdded }) => {
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
            const res = await apiFetch(
                `/internal/finances/periods/${period.id}/jobs/range`,
                {
                    method: 'POST',
                    body: { invoice_from: from, invoice_to: to },
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
