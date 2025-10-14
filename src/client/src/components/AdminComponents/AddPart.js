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
    const [quantity, setQuantity] = useState(0);
    const [files, setFiles] = useState([]);
    const [details, setDetails] = useState('');
    const [rev, setRev] = useState(''); 
    const [errors, setErrors] = useState({});
    // const [analyzeFile, setAnalyzeFile] = useState(null);

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
        setRev('');
        setErrors({});
    };

    const postRequest = async (e) => {
        e.preventDefault();
        
        // Validate form fields
        const newErrors = {};
        
        if (!number.trim()) {
            newErrors.number = 'Part number is required';
        }
        
        if (!description.trim()) {
            newErrors.description = 'Description is required';
        }
        
        if (accessLevel > 1 && (unitPrice <= 0 || !unitPrice)) {
            newErrors.unitPrice = 'Unit price must be greater than 0';
        }
        
        if (quantity <= 0 || !quantity) {
            newErrors.quantity = 'Quantity must be greater than 0';
        }
        
        // If there are errors, set them and return early
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        
        // Clear errors if validation passes
        setErrors({});
    
        try {
            // 1. Create or find part
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/part/newpart`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ number, description}),
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
                        price: unitPrice,
                        rev: rev,
                        details: details
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
                {errors.number && <div style={{ color: 'red', fontSize: '12px' }}>{errors.number}</div>}
                
                <textarea
                    placeholder='Description'
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
                {errors.description && <div style={{ color: 'red', fontSize: '12px' }}>{errors.description}</div>}
                
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
                        {errors.unitPrice && <div style={{ color: 'red', fontSize: '12px' }}>{errors.unitPrice}</div>}
                    </div>
                )}
                <p>Quantity</p>
                <input
                    type='number'
                    placeholder='Quantity'
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min={0}
                />
                {errors.quantity && <div style={{ color: 'red', fontSize: '12px' }}>{errors.quantity}</div>}
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
