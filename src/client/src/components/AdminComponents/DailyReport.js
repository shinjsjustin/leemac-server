import React, { useState, useEffect } from 'react';
import Navbar from '../Navbar';

const FieldRow = ({ label, value, onChange }) => (
    <div style={{ marginBottom: '20px' }}>
        <label style={{ fontWeight: '700', fontSize: '14px', display: 'block', marginBottom: '6px', color: '#1a1a1a' }}>
            {label}
        </label>
        <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{
                width: '100%', minHeight: '70px', padding: '8px 10px',
                fontSize: '14px', border: '1px solid #ccc', borderRadius: '4px',
                boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
            }}
        />
    </div>
);

const PrintSection = ({ title, value }) => (
    <div style={{ marginBottom: '18px', pageBreakInside: 'avoid' }}>
        <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '4px', borderBottom: '1px solid #ddd', paddingBottom: '2px' }}>
            {title}
        </div>
        <div style={{ fontSize: '12px', whiteSpace: 'pre-wrap', color: '#222', paddingLeft: '8px', marginTop: '4px' }}>
            {value}
        </div>
    </div>
);

const DailyReport = () => {
    const [jobGroups, setJobGroups] = useState({});
    const [formValues, setFormValues] = useState({ expenses: '', notes: '' });
    const [noData, setNoData] = useState(false);

    useEffect(() => {
        const raw = localStorage.getItem('dailyReportData');
        if (!raw) { setNoData(true); return; }
        try {
            const parsed = JSON.parse(raw);
            setJobGroups(parsed);
            const initial = { expenses: '', notes: '' };
            Object.values(parsed).forEach(group => {
                group.parts.forEach(part => {
                    initial[`part_${part.job_part_id}`] = '';
                });
            });
            setFormValues(initial);
        } catch (e) {
            console.error('Failed to parse report data', e);
            setNoData(true);
        }
    }, []);

    const allParts = Object.values(jobGroups).flatMap(g =>
        g.parts.map(p => ({ group: g, part: p }))
    );

    const formatDate = (isoString) => {
        if (!isoString) return null;
        const date = new Date(isoString);
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };

    const getTodayHeader = () =>
        new Date().toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        });

    const formatPartTitle = (group, part) => {
        const partStr = part.details ? `Part ${part.part_number} (${part.details})` : `Part ${part.part_number}`;
        const poStr = group.po_date ? `PO Date - ${formatDate(group.po_date)}` : null;
        return [
            `#${group.job_number}`,
            group.attention,
            partStr,
            `Qty: ${part.quantity ?? 1}`,
            poStr,
        ].filter(v => v != null && v !== '').join(', ');
    };

    const handleChange = (key, value) =>
        setFormValues(prev => ({ ...prev, [key]: value }));

    const filledParts = allParts.filter(({ part }) => formValues[`part_${part.job_part_id}`]?.trim());
    const emptyParts  = allParts.filter(({ part }) => !formValues[`part_${part.job_part_id}`]?.trim());

    if (noData) {
        return (
            <div>
                <Navbar />
                <div className="requests" style={{ textAlign: 'center', paddingTop: '60px', color: '#999' }}>
                    <p>No report data found.</p>
                    <p style={{ fontSize: '13px' }}>Open this page using the <strong>Daily Report</strong> button on the Starred Jobs page.</p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <Navbar />

            {/* ── Screen form ───────────────────────────────────────────── */}
            <div id="report-screen" className="requests" style={{ maxWidth: '800px' }}>
                <h2 style={{ textAlign: 'center', marginBottom: '28px' }}>
                    Daily Report — {getTodayHeader()}
                </h2>

                <FieldRow
                    label="Expenses"
                    value={formValues.expenses}
                    onChange={v => handleChange('expenses', v)}
                />

                {allParts.map(({ group, part }) => (
                    <FieldRow
                        key={part.job_part_id}
                        label={formatPartTitle(group, part)}
                        value={formValues[`part_${part.job_part_id}`] || ''}
                        onChange={v => handleChange(`part_${part.job_part_id}`, v)}
                    />
                ))}

                <FieldRow
                    label="Notes"
                    value={formValues.notes}
                    onChange={v => handleChange('notes', v)}
                />

                <button
                    onClick={() => window.print()}
                    style={{
                        padding: '12px 32px', backgroundColor: '#163a16', color: '#fff',
                        border: 'none', borderRadius: '6px', fontSize: '15px',
                        fontWeight: '600', cursor: 'pointer', marginTop: '8px', marginBottom: '40px',
                    }}
                >
                    Save &amp; Print PDF
                </button>
            </div>

            {/* ── Print-only view ───────────────────────────────────────── */}
            <div id="report-print">
                <h1 style={{ fontSize: '18px', textAlign: 'center', marginBottom: '4px' }}>
                    Daily Report
                </h1>
                <p style={{ textAlign: 'center', fontSize: '13px', marginBottom: '24px', color: '#555', borderBottom: '2px solid #000', paddingBottom: '12px' }}>
                    {getTodayHeader()}
                </p>

                {formValues.expenses?.trim() && (
                    <PrintSection title="Expenses" value={formValues.expenses} />
                )}

                {filledParts.map(({ group, part }) => (
                    <PrintSection
                        key={part.job_part_id}
                        title={formatPartTitle(group, part)}
                        value={formValues[`part_${part.job_part_id}`]}
                    />
                ))}

                {formValues.notes?.trim() && (
                    <PrintSection title="Notes" value={formValues.notes} />
                )}

                {emptyParts.length > 0 && (
                    <div style={{ marginTop: '32px', paddingTop: '14px', borderTop: '1px dashed #aaa' }}>
                        <div style={{ fontWeight: '700', fontSize: '13px', marginBottom: '8px' }}>No Changes</div>
                        {emptyParts.map(({ group, part }) => (
                            <p key={part.job_part_id} style={{ fontSize: '12px', color: '#666', margin: '3px 0' }}>
                                — {formatPartTitle(group, part)}
                            </p>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
                #report-print { display: none; }
                @media print {
                    body { visibility: hidden; margin: 0; }
                    #report-print {
                        display: block !important;
                        visibility: visible;
                        position: absolute;
                        top: 0; left: 0;
                        width: 100%;
                        padding: 24px;
                        box-sizing: border-box;
                    }
                    #report-print * { visibility: visible; }
                }
            `}</style>
        </div>
    );
};

export default DailyReport;
