import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import AddPart from './AddPart';

const Job = () => {
    const { id } = useParams();
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    const [job, setJob] = useState(null);
    const [parts, setParts] = useState([]);
    const [poDetails, setPoDetails] = useState({
        poNum: '',
        poDate: '',
        dueDate: '',
        taxCode: '',
        tax: '',
        taxPercent: '',
    });

    const [invoiceDetails, setInvoiceDetails] = useState({
        invoiceNum: '',
    });

    const fetchJobDetails = useCallback(async () => {
        try {
            const res = await fetch(
                `${process.env.REACT_APP_URL}/internal/job/jobsummary?id=${id}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );
            const data = await res.json();
            if (res.status === 200) {
                setJob(data.job);
                setParts(data.parts);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [id, token]);

    useEffect(() => {
        fetchJobDetails();
    }, [fetchJobDetails]);

    const handlePartClick = (partId) => {
        navigate(`/part/${partId}`);
    };

    const handlePartAdded = (newPart) => {
        setParts(prev => [...prev, newPart]);
    };

    const handleGoBack = () => {
        navigate('/joblist');
    };

    const handlePopulateSheet = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/sheet/populate`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ job, parts }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Google Sheet populated successfully!');
            } else {
                console.error(data);
                alert('Failed to populate Google Sheet.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while populating Google Sheet.');
        }
    };

    const handlePoChange = (e) => {
        const { name, value } = e.target;
        setPoDetails((prev) => ({ ...prev, [name]: value }));
    };

    const handleInvoiceChange = (e) => {
        const { name, value } = e.target;
        setInvoiceDetails((prev) => ({ ...prev, [name]: value }));
    };

    const handleUpdatePo = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/updatepo`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id, ...poDetails }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('PO updated successfully!');
                fetchJobDetails();
            } else {
                console.error(data);
                alert('Failed to update PO.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while updating PO.');
        }
    };

    const handleUpdateInvoice = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/updateinvoice`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id, ...invoiceDetails }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Invoice updated successfully!');
                fetchJobDetails();
            } else {
                console.error(data);
                alert('Failed to update invoice.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while updating invoice.');
        }
    };

    const triggerExport = useCallback(
        async (actionType) => {
            try {
                await handlePopulateSheet();

                const res = await fetch(
                    'https://script.google.com/macros/s/AKfycbwBmp0MlpTcBaczJXCUyo9_mQ3DPZMpeH4lmGOBRqW6QQ5JHKcCoUhTpFNfpGvrUmMh/exec',
                    {
                        method: 'POST',
                        mode: 'no-cors', // Add this line to bypass CORS
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ action: actionType }),
                    }
                );

                console.log('Request sent. Response may not be accessible due to no-cors mode.');
            } catch (e) {
                console.error('Network or fetch error:', e);
            }
        },
        [token, handlePopulateSheet]
    );

    if (!job) return <div>Loading...</div>;

    return (
        <div>
            <Navbar />
            <button onClick={handleGoBack}>Back</button>
            <button onClick={handlePopulateSheet}>Populate Google Sheet</button>
            <button onClick={() => triggerExport('exportQuote')}>Export Quote</button>
            <button onClick={() => triggerExport('exportOrder')}>Export Order</button>
            <button onClick={() => triggerExport('exportInvoice')}>Export Invoice</button>
            <button onClick={() => triggerExport('exportPackList')}>Export Packing List</button>
            <button onClick={() => triggerExport('exportShipping')}>Export Shipping</button>
            <div className='requests'>
                <h2>Job #{job.job_number}</h2>
                <p><strong>Attention:</strong> {job.attention}</p>
                <p><strong>Company:</strong> {job.company_name}</p>
                <p><strong>Created:</strong> {job.created_at?.slice(0, 10)}</p>
                <p><strong>PO Number:</strong> {job.po_number || '—'}</p>
                <p><strong>PO Date:</strong> {job.po_date || '—'}</p>
                <p><strong>Due Date:</strong> {job.due_date || '—'}</p>
                <p><strong>Tax Code:</strong> {job.tax_code || '—'}</p>
                <p><strong>Tax:</strong> {job.tax || '—'}</p>
                <p><strong>Tax Percent:</strong> {job.tax_percent || '—'}</p>
                <p><strong>Invoice Number:</strong> {job.invoice_number || '—'}</p>
                <p><strong>Invoice Date:</strong> {job.invoice_date || '—'}</p>
                <h3>Update PO</h3>
                <form onSubmit={(e) => { e.preventDefault(); handleUpdatePo(); }}>
                    <input type="text" name="poNum" placeholder="PO Number" value={poDetails.poNum} onChange={handlePoChange} />
                    <input type="date" name="poDate" placeholder="PO Date" value={poDetails.poDate} onChange={handlePoChange} />
                    <input type="date" name="dueDate" placeholder="Due Date" value={poDetails.dueDate} onChange={handlePoChange} />
                    <input type="text" name="taxCode" placeholder="Tax Code" value={poDetails.taxCode} onChange={handlePoChange} />
                    <input type="number" name="tax" placeholder="Tax" value={poDetails.tax} onChange={handlePoChange} />
                    <input type="number" name="taxPercent" placeholder="Tax Percent" value={poDetails.taxPercent} onChange={handlePoChange} />
                    <button type="submit">Update PO</button>
                </form>

                <h3>Update Invoice</h3>
                <form onSubmit={(e) => { e.preventDefault(); handleUpdateInvoice(); }}>
                    <input type="text" name="invoiceNum" placeholder="Invoice Number" value={invoiceDetails.invoiceNum} onChange={handleInvoiceChange} />
                    <button type="submit">Update Invoice</button>
                </form>
                <h3>Parts in Job</h3>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Part #</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                        </tr>
                    </thead>
                    <tbody>
                        {parts.map(part => (
                            <tr key={part.id} onClick={() => handlePartClick(part.id)} style={{ cursor: 'pointer' }}>
                                <td>{part.number}</td>
                                <td>{part.quantity}</td>
                                <td>${part.price}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <hr />
                <AddPart jobId={id} onPartAdded={handlePartAdded} />
            </div>
        </div>
    );
};

export default Job;
