import React, { useState, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import '../Styling/RequestTable.css';

const AddPart = ({ jobId, onPartAdded }) => {
    const token = localStorage.getItem('token');
        const decodedToken = token ? jwtDecode(token) : null;
        const accessLevel = decodedToken?.access || 0;

    const [number, setNumber] = useState('');
    const [description, setDescription] = useState('');
    const [unitPrice, setPrice] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [files, setFiles] = useState([]);
    const [details, setDetails] = useState('');
    const [rev, setRev] = useState(''); // Added state for rev

    
    const handleFileChange = (e) => {
        setFiles([...files, ...e.target.files]);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setFiles([...files, ...e.dataTransfer.files]);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const removeFile = (index) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const resetFields = () => {
        setNumber('');
        setDescription('');
        setPrice(0);
        setQuantity(1);
        setFiles([]);
        setDetails('');
        setRev(''); // Reset rev
    };

    const postRequest = async (e) => {
        e.preventDefault();
    
        try {
            // 1. Create or find part
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/newpart`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ number, description, unitPrice, details, rev }), // Added rev
            });
    
            const data = await response.json();
    
            if (response.status === 200 || response.status === 201) {
                const partId = data.id;
                const isExisting = data.existing;
    
                // 2. Upload files only if the part was newly created
                if (!isExisting && files.length > 0) {
                    for (let i = 0; i < files.length; i++) {
                        const formData = new FormData();
                        formData.append('files', files[i]);
    
                        const fileResponse = await fetch(
                            `${process.env.REACT_APP_URL}/internal/part/uploadblob?id=${partId}`,
                            {
                                method: 'POST',
                                body: formData,
                                headers: {
                                    Authorization: `Bearer ${token}`,
                                },
                            }
                        );
    
                        if (!fileResponse.ok) {
                            throw new Error('File upload failed');
                        }
                    }
                }
    
                // 3. Join part to job
                await fetch(`${process.env.REACT_APP_URL}/internal/job/jobpartjoin`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        jobId: jobId,
                        partId: partId,
                        quantity: quantity,
                    }),
                });
    
                if (onPartAdded) {
                    onPartAdded({ id: partId, number, description });
                }
    
                resetFields();
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error('Error:', e);
        }
    };

    return (
        <div className='container'>
            <h2 className='header'>Add Part</h2>
            <form className='container-form' onSubmit={postRequest}>
                <input
                    type='text'
                    placeholder='Part Number'
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    required
                />
                <textarea
                    placeholder='Description'
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
                <textarea
                    placeholder='Details'
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                />
                <input
                    type='text'
                    placeholder='Revision'
                    value={rev}
                    onChange={(e) => setRev(e.target.value)} 
                />
                {accessLevel > 1 && (
                    <div>
                        <p>Unit Price</p>
                        <input
                            type='number'
                            placeholder='Unit Price'
                            value={unitPrice}
                            onChange={(e) => setPrice(e.target.value)}
                        />
                    </div>
                )}
                <p>Quantity</p>
                <input
                    type='number'
                    placeholder='Quantity'
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min={1}
                />
                <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    style={{ border: '2px dashed #ccc', padding: '20px', marginBottom: '10px' }}
                >
                    Drag and drop files here
                </div>
                <input type='file' multiple onChange={handleFileChange} />
                <div>
                    <h4>Files to be uploaded:</h4>
                    {files.map((file, index) => (
                        <div key={index} style={{ marginBottom: '5px' }}>
                            <span>{file.name} ({(file.size / 1024).toFixed(2)} KB)</span>
                            <button type='button' onClick={() => removeFile(index)} style={{ marginLeft: '10px' }}>
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
                <button type='submit'>Add Part</button>
            </form>
        </div>
    );
};

export default AddPart;
