import React, { useState, useRef } from 'react';
import Navbar from '../Navbar';

export const SHOP_STATUSES = [
    { key: 'quoted',             label: 'Quoted – Awaiting PO',   color: '#5C6BC0', bg: '#E8EAF6', border: '#9FA8DA' },
    { key: 'checking_stock',     label: 'Checking Stock',          color: '#00838F', bg: '#E0F7FA', border: '#80DEEA' },
    { key: 'waiting_material',   label: 'Waiting for Material',    color: '#E65100', bg: '#FFF3E0', border: '#FFCC80' },
    { key: 'at_subvendor',       label: 'At Subvendor',            color: '#6A1B9A', bg: '#F3E5F5', border: '#CE93D8' },
    { key: 'programming',        label: 'Programming',             color: '#1565C0', bg: '#E3F2FD', border: '#90CAF9' },
    { key: 'setup',              label: 'Machine Setup',           color: '#1B6CA8', bg: '#DCEEFB', border: '#64B5F6' },
    { key: 'running_machine_a',  label: 'Running – Machine A',     color: '#2E7D32', bg: '#E8F5E9', border: '#A5D6A7' },
    { key: 'running_machine_d',  label: 'Running – Machine D',     color: '#1B5E20', bg: '#C8E6C9', border: '#66BB6A' },
    { key: 'running_manual',     label: 'Running – Manual',        color: '#33691E', bg: '#F1F8E9', border: '#AED581' },
    { key: 'deburr_clean',       label: 'Deburr & Clean',          color: '#558B2F', bg: '#F9FBE7', border: '#C5E1A5' },
    { key: 'qa',                 label: 'QA Check',                color: '#F57F17', bg: '#FFF8E1', border: '#FFE082' },
    { key: 'waiting_finish',     label: 'Waiting for Finish',      color: '#AD1457', bg: '#FCE4EC', border: '#F48FB1' },
    { key: 'packing',            label: 'Packing',                 color: '#37474F', bg: '#ECEFF1', border: '#B0BEC5' },
    { key: 'delivered',          label: 'Delivered',               color: '#1B5E20', bg: '#E8F5E9', border: '#81C784' },
    { key: 'invoiced',           label: 'Invoiced / Closed',       color: '#424242', bg: '#F5F5F5', border: '#BDBDBD' },
];

const ShopUpdate = () => {
    const token = localStorage.getItem('token');

    const [selectedStatus, setSelectedStatus] = useState(null);
    // 'nfc' | 'manual'
    const [inputMode, setInputMode] = useState('nfc');
    const [jobNumber, setJobNumber] = useState('');
    const [partNumber, setPartNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [nfcScanning, setNfcScanning] = useState(false);
    const [result, setResult] = useState(null);
    const nfcAbortRef = useRef(null);

    const handleStatusClick = (status) => {
        setSelectedStatus(status);
        setInputMode('nfc');
        setJobNumber('');
        setPartNumber('');
        setResult(null);
        setNfcScanning(false);
    };

    const handleClose = () => {
        if (nfcAbortRef.current) nfcAbortRef.current.abort();
        setSelectedStatus(null);
        setResult(null);
        setNfcScanning(false);
    };

    const handleSubmit = async () => {
        if (!jobNumber.trim() || !partNumber.trim()) {
            setResult({ success: false, message: 'Please enter both job number and part number.' });
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/updatestarstatusbyjobnumber`,
                {
                    method: 'PUT',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jobNumber: jobNumber.trim(),
                        partNumber: partNumber.trim(),
                        status: selectedStatus.key,
                    }),
                }
            );
            const data = await res.json();
            if (res.ok) {
                setResult({
                    success: true,
                    message: `Updated! Part ${partNumber.trim()} on job ${jobNumber.trim()} → ${selectedStatus.label}`,
                });
                setJobNumber('');
                setPartNumber('');
            } else {
                setResult({ success: false, message: data.error || 'Update failed.' });
            }
        } catch (e) {
            setResult({ success: false, message: 'Network error. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const startNfcScan = async () => {
        if (!('NDEFReader' in window)) {
            setResult({ success: false, message: 'Web NFC is not supported on this device or browser. Use Chrome on Android.' });
            setInputMode('nfc');
            return;
        }
        setNfcScanning(true);
        setResult(null);
        try {
            const reader = new window.NDEFReader();
            const abort = new AbortController();
            nfcAbortRef.current = abort;
            await reader.scan({ signal: abort.signal });
            reader.onreading = async (event) => {
                abort.abort();
                setNfcScanning(false);
                const tagId = event.serialNumber;
                setLoading(true);
                try {
                    const res = await fetch(
                        `${process.env.REACT_APP_URL}/internal/job/updatestarstatusbynfctag`,
                        {
                            method: 'PUT',
                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nfcTagId: tagId, status: selectedStatus.key }),
                        }
                    );
                    const data = await res.json();
                    if (res.ok) {
                        setResult({ success: true, message: `Updated via NFC tag → ${selectedStatus.label}` });
                    } else {
                        setResult({ success: false, message: data.error || 'Update failed.' });
                    }
                } catch {
                    setResult({ success: false, message: 'Network error. Please try again.' });
                } finally {
                    setLoading(false);
                }
            };
            reader.onreadingerror = () => {
                setNfcScanning(false);
                setResult({ success: false, message: 'Failed to read NFC tag. Try again.' });
            };
        } catch (e) {
            setNfcScanning(false);
            setResult({ success: false, message: e.message || 'NFC scan failed.' });
        }
    };

    const cancelNfcScan = () => {
        if (nfcAbortRef.current) nfcAbortRef.current.abort();
        setNfcScanning(false);
    };

    return (
        <div>
            <Navbar />
            <div style={{ maxWidth: '640px', margin: '0 auto', padding: '16px' }}>
                <h2 style={{ marginBottom: '6px', fontSize: '22px', fontWeight: 'bold' }}>Shop Update</h2>
                <p style={{ marginBottom: '20px', color: '#666', fontSize: '14px' }}>
                    Select a workflow stage, then enter the job and part number or scan an NFC tag.
                </p>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: '10px',
                }}>
                    {SHOP_STATUSES.map(s => (
                        <button
                            key={s.key}
                            onClick={() => handleStatusClick(s)}
                            style={{
                                padding: '16px 10px',
                                borderRadius: '8px',
                                border: `2px solid ${s.border}`,
                                backgroundColor: s.bg,
                                color: s.color,
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '700',
                                textAlign: 'center',
                                lineHeight: '1.3',
                                transition: 'filter 0.1s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.94)')}
                            onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Modal overlay */}
            {selectedStatus && (
                <div
                    style={{
                        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1000, padding: '16px',
                    }}
                    onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
                >
                    <div style={{
                        backgroundColor: '#fff', borderRadius: '12px', padding: '24px',
                        width: '100%', maxWidth: '360px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    }}>
                        {/* Status badge */}
                        <div style={{
                            display: 'inline-block', padding: '6px 14px', borderRadius: '8px',
                            marginBottom: '16px', backgroundColor: selectedStatus.bg,
                            color: selectedStatus.color, border: `2px solid ${selectedStatus.border}`,
                            fontWeight: '700', fontSize: '14px',
                        }}>
                            {selectedStatus.label}
                        </div>

                        {/* Mode toggle */}
                        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #ddd', marginBottom: '20px' }}>
                            {['nfc', 'manual'].map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => { setInputMode(mode); setResult(null); cancelNfcScan(); }}
                                    style={{
                                        flex: 1, padding: '9px', border: 'none', cursor: 'pointer',
                                        fontSize: '13px', fontWeight: '600',
                                        backgroundColor: inputMode === mode ? '#163a16' : '#fff',
                                        color: inputMode === mode ? '#fff' : '#555',
                                    }}
                                >
                                    {mode === 'nfc' ? '📡 NFC Scan' : 'Manual Entry'}
                                </button>
                            ))}
                        </div>

                        {/* Manual mode */}
                        {inputMode === 'manual' && (
                            <>
                                <div style={{ marginBottom: '14px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>
                                        Job Number
                                    </label>
                                    <input
                                        type="text"
                                        value={jobNumber}
                                        onChange={e => setJobNumber(e.target.value)}
                                        placeholder="e.g. 24-001"
                                        autoFocus
                                        style={{
                                            width: '100%', padding: '11px', fontSize: '16px',
                                            borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div style={{ marginBottom: '18px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '5px' }}>
                                        Part Number
                                    </label>
                                    <input
                                        type="text"
                                        value={partNumber}
                                        onChange={e => setPartNumber(e.target.value)}
                                        placeholder="e.g. LM-1234"
                                        onKeyDown={e => e.key === 'Enter' && !loading && handleSubmit()}
                                        style={{
                                            width: '100%', padding: '11px', fontSize: '16px',
                                            borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                            </>
                        )}

                        {/* NFC mode */}
                        {inputMode === 'nfc' && (
                            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                                {!nfcScanning && !result && (
                                    <>
                                        <div style={{ fontSize: '48px', marginBottom: '8px' }}>📡</div>
                                        <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
                                            Press <strong>Start Scan</strong> then hold the NFC tag to your phone.
                                        </p>
                                        <button
                                            onClick={startNfcScan}
                                            style={{
                                                padding: '12px 28px', borderRadius: '6px', border: 'none',
                                                backgroundColor: '#0277bd', color: '#fff',
                                                cursor: 'pointer', fontSize: '15px', fontWeight: '700',
                                            }}
                                        >
                                            Start Scan
                                        </button>
                                    </>
                                )}
                                {nfcScanning && (
                                    <>
                                        <div style={{ fontSize: '48px', marginBottom: '8px' }}>📡</div>
                                        <p style={{ fontSize: '14px', color: '#0277bd', fontWeight: '600', marginBottom: '16px' }}>
                                            Scanning… hold tag to phone
                                        </p>
                                        <button
                                            onClick={cancelNfcScan}
                                            style={{
                                                padding: '10px 24px', borderRadius: '6px',
                                                border: '1px solid #ccc', backgroundColor: '#fff',
                                                cursor: 'pointer', fontSize: '14px',
                                            }}
                                        >
                                            Cancel Scan
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {result && (
                            <div style={{
                                padding: '10px 12px', borderRadius: '6px', marginBottom: '14px',
                                backgroundColor: result.success ? '#E8F5E9' : '#FDECEA',
                                color: result.success ? '#2E7D32' : '#C62828',
                                fontSize: '13px', lineHeight: '1.4',
                            }}>
                                {result.message}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleClose}
                                style={{
                                    flex: 1, padding: '11px', borderRadius: '6px',
                                    border: '1px solid #ccc', backgroundColor: '#fff',
                                    cursor: 'pointer', fontSize: '14px',
                                }}
                            >
                                Close
                            </button>
                            {inputMode === 'manual' && (
                                <button
                                    onClick={handleSubmit}
                                    disabled={loading}
                                    style={{
                                        flex: 1, padding: '11px', borderRadius: '6px',
                                        border: 'none', backgroundColor: loading ? '#aaa' : '#163a16',
                                        color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                                        fontSize: '14px', fontWeight: '700',
                                    }}
                                >
                                    {loading ? 'Updating…' : 'Update'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ShopUpdate;

