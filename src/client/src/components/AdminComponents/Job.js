import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import AddPart from './AddPart';
import '../Styling/Job.css';
import { jwtDecode } from 'jwt-decode';
import TopBar from './TopBar';
import NotesSection from './NotesSection';

const Job = () => {
    const { id } = useParams();
    const token = localStorage.getItem('token');
    const navigate = useNavigate();

    const [job, setJob] = useState(null);
    const [parts, setParts] = useState([]);
    const [partFiles, setPartFiles] = useState({}); // Store files for each part
    const [poDetails, setPoDetails] = useState({
        poNum: '',
        poDate: '',
        dueDate: '',
        taxCode: '',
        tax: '',
        taxPercent: '',
    });

    const decodedToken = token ? jwtDecode(token) : null;
    const accessLevel = decodedToken?.access || 0;
    const userId = decodedToken?.id;
    const [starredJobs, setStarredJobs] = useState([]);

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

    const fetchStarredJobs = useCallback(async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/getstarredjobs`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });
            const data = await res.json();
            if (res.status === 200) {
                setStarredJobs(data.map(job => job.job_id));
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    const fetchPartFiles = useCallback(async (partId) => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/getblob?partID=${partId}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error('Fetching Files Error');
            }

            const fileDetails = await response.json();
            const mappedFiles = fileDetails.map((file) => {
                let previewUrl = null;

                if (file.mimetype === 'application/pdf' && file.content) {
                    try {
                        const binaryString = window.atob(file.content);
                        const len = binaryString.length;
                        const bytes = new Uint8Array(len);
                        for (let i = 0; i < len; i++) {
                            bytes[i] = binaryString.charCodeAt(i);
                        }
                        const blob = new Blob([bytes], { type: file.mimetype });
                        previewUrl = URL.createObjectURL(blob);
                    } catch (error) {
                        console.error('Error converting base64 to Blob:', error);
                    }
                }

                return {
                    ...file,
                    fileID: file.id,
                    previewUrl,
                };
            });

            setPartFiles(prev => ({
                ...prev,
                [partId]: mappedFiles
            }));
        } catch (e) {
            console.error(e);
        }
    }, [token]);

    const handleFilePreview = (url) => {
        const newTab = window.open(url, '_blank');
        if (newTab) {
            newTab.focus();
        } else {
            alert('Unable to open preview. Please allow pop-ups for this site.');
        }
    };

    useEffect(() => {
        fetchJobDetails();
        fetchStarredJobs();
    }, [fetchJobDetails, fetchStarredJobs]);

    useEffect(() => {
        // Fetch files for each part when parts are loaded
        parts.forEach(part => {
            fetchPartFiles(part.id);
        });
    }, [parts, fetchPartFiles]);

    const handlePartClick = (partId) => {
        navigate(`/part/${partId}`);
    };

    const handlePartAdded = (newPart) => {
        setParts(prev => [...prev, newPart]);
    };

    const handlePoChange = (e) => {
        const { name, value } = e.target;
        setPoDetails((prev) => ({ ...prev, [name]: value }));
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

    const handleUpdateInvoiceAndIncrement = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/updateinvoiceandincrement`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Invoice updated and incremented successfully!');
                fetchJobDetails();
            } else {
                console.error(data);
                alert('Failed to update and increment invoice.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while updating and incrementing invoice.');
        }
    };

    const handleRemovePart = async (partId) => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/jobpartremove`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id, partId }),
            });
            const data = await res.json();
            if (res.status === 200) {
                alert('Part removed successfully!');
                setParts((prev) => prev.filter((part) => part.id !== partId));
            } else {
                console.error(data);
                alert('Failed to remove part.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while removing part.');
        }
    };

    const handleStarJob = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/starjob`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await response.json();
            if (response.status === 201) {
                alert('Job starred successfully!');
            } else {
                console.error(data);
                alert('Failed to star the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while starring the job.');
        }
    };

    const handleUnstarJob = async () => {
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/job/unstarjob`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Job unstarred successfully!');
                setStarredJobs((prev) => prev.filter((jobId) => jobId !== id));
            } else {
                console.error(data);
                alert('Failed to unstar the job.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while unstarring the job.');
        }
    };

    const handleUpdateQuantity = async (partId, newQuantity) => {
        if (newQuantity <= 0) {
            return alert('Quantity must be greater than 0.');
        }

        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/updatequantity`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id, partId, quantity: newQuantity }),
            });
            const data = await res.json();
            if (res.status === 200) {
                alert('Quantity updated successfully!');
                fetchJobDetails();
            } else {
                console.error(data);
                alert('Failed to update quantity.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while updating quantity.');
        }
    };

    const handleCosts = async () => {
        try {
            const res = await fetch(`${process.env.REACT_APP_URL}/internal/job/calculatecost`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: id }),
            });
            const data = await res.json();
            if (res.status === 200) {
                alert('Costs calculated successfully!');
                setJob((prevJob) => ({
                    ...prevJob,
                    subtotal: data.subtotal,
                    total_cost: data.total_cost,
                }));
            } else {
                console.error(data);
                alert('Failed to calculate costs.');
            }
        } catch (e) {
            console.error(e);
            alert('Error occurred while calculating costs.');
        }
    };

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        const options = { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
        return date.toLocaleString('en-US', options).replace(',', ' @');
    };

    if (!job) return (
        <div>
            <Navbar />
            <div className="centered-button-container">
                <button onClick={() => navigate('/')}>Session expired, click to return home</button>
            </div>
        </div>
    );

    return (
        <div className="job-page">
            <Navbar />
            <TopBar 
                accessLevel={accessLevel} 
                job={job} 
                parts={parts} 
                token={token} 
            />
            <button className="top-bar-button" onClick={handleCosts}>Costs 가격</button>
            {accessLevel >= 2 && (
                <div>
                    <button className="top-bar-button" onClick={handleUpdateInvoiceAndIncrement}>Update Invoice</button>
                    {starredJobs.includes(id) ? (
                        <button className="top-bar-button" onClick={handleUnstarJob}>Unstar Job</button>
                    ) : (
                        <button className="top-bar-button" onClick={handleStarJob}>Star Job</button>
                    )}
                </div>
            )}
            <div className="job-notes-container">
                <div className="job-details">
                    <h2>직무번호 Job #{job.job_number}</h2>
                    <p><strong>Attention 담당자:</strong> {job.attention}</p>
                    <p><strong>Company 회사:</strong> {job.company_name}</p>
                    <p><strong>Created 생성 날짜:</strong> {formatDate(job.created_at)}</p>
                    <p><strong>PO Number:</strong> {job.po_number || '—'}</p>
                    <p><strong>PO Date:</strong> {formatDate(job.po_date) || '—'}</p>
                    <p><strong>Due Date 만기일:</strong> {formatDate(job.due_date) || '—'}</p>
                    <p><strong>Tax Code:</strong> {job.tax_code || '—'}</p>
                    <p><strong>Tax:</strong> {job.tax || '—'}</p>
                    <p><strong>Tax Percent:</strong> {job.tax_percent || '—'}</p>
                    <p><strong>Invoice Number:</strong> {job.invoice_number || '—'}</p>
                    <p><strong>Invoice Date:</strong> {formatDate(job.due_date) || '—'}</p>
                    <p><strong>Subtotal:</strong> {job.subtotal || '—'}</p>
                    <p><strong>Total:</strong> {job.total_cost || '—'}</p>
                </div>
                <NotesSection 
                    jobId={id} 
                    userId={userId} 
                    token={token} 
                    accessLevel={accessLevel} 
                />
            </div>
            <div className='requests'>
                {accessLevel >= 2 && (
                    <>
                        <h3>Update PO</h3>
                        <form className="update-po-form" onSubmit={(e) => { e.preventDefault(); handleUpdatePo(); }}>
                            <input className="po-input" type="text" name="poNum" placeholder="PO Number" value={poDetails.poNum} onChange={handlePoChange} />
                            <input className="po-input" type="date" name="poDate" placeholder="PO Date" value={poDetails.poDate} onChange={handlePoChange} />
                            <input className="po-input" type="date" name="dueDate" placeholder="Due Date" value={poDetails.dueDate} onChange={handlePoChange} />
                            <input className="po-input" type="text" name="taxCode" placeholder="Tax Code" value={poDetails.taxCode} onChange={handlePoChange} />
                            <input className="po-input" type="number" name="tax" placeholder="Tax" value={poDetails.tax} onChange={handlePoChange} />
                            <input className="po-input" type="number" name="taxPercent" placeholder="Tax Percent" value={poDetails.taxPercent} onChange={handlePoChange} />
                            <button className="po-button" type="submit">Update PO</button>
                        </form>
                    </>
                )}
                <h3>Parts in Job 부분품</h3>
                <table className='requests-table'>
                    <thead>
                        <tr>
                            <th>Part # 부품 번호</th>
                            <th>Rev 개정</th>
                            <th>Details 세부</th>
                            <th>Qty 수량</th>
                            <th>Unit Price 단가</th>
                            <th>Actions 행위</th>
                        </tr>
                    </thead>
                    <tbody>
                        {parts.map(part => (
                            <tr key={part.id} style={{ cursor: 'pointer' }}>
                                <td onClick={() => handlePartClick(part.id)}>{part.number}</td>
                                <td onClick={() => handlePartClick(part.id)}>{part.rev}</td>
                                <td onClick={() => handlePartClick(part.id)}>{part.details}</td>
                                <td>
                                    {accessLevel >= 1 ? (
                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                            <input
                                                type="number"
                                                defaultValue={part.quantity}
                                                min="1"
                                                onChange={(e) => part.newQuantity = parseInt(e.target.value, 10)}
                                                style={{ width: '60px', marginRight: '10px' }}
                                            />
                                            <button
                                                className="update-quantity-button"
                                                onClick={() => handleUpdateQuantity(part.id, part.newQuantity || part.quantity)}
                                            >
                                                Update 변화
                                            </button>
                                        </div>
                                    ) : (
                                        part.quantity
                                    )}
                                </td>
                                <td onClick={() => handlePartClick(part.id)}>${part.price}</td>
                                <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        <button className="remove-part-button" onClick={() => handleRemovePart(part.id)}>Remove 삭제</button>
                                        {partFiles[part.id] && partFiles[part.id]
                                            .filter(file => file.mimetype === 'application/pdf' && file.previewUrl)
                                            .map((file, index) => (
                                                <button 
                                                    key={index}
                                                    className="preview-button"
                                                    onClick={() => handleFilePreview(file.previewUrl)}
                                                    style={{ fontSize: '12px', padding: '2px 8px' }}
                                                >
                                                    Preview {file.filename}
                                                </button>
                                            ))}
                                    </div>
                                </td>
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
