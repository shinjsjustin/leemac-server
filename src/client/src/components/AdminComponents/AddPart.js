import React, { useState } from 'react';
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
    
    // New states for part lookup
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedPart, setSelectedPart] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [useCustomValues, setUseCustomValues] = useState(false);

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

    const searchParts = async () => {
        if (!searchTerm.trim()) return;

        try {
            const response = await fetch(
                `${process.env.REACT_APP_URL}/internal/part/searchparts?searchTerm=${encodeURIComponent(searchTerm)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (response.ok) {
                const results = await response.json();
                setSearchResults(results);
            }
        } catch (error) {
            console.error('Error searching parts:', error);
        }
    };

    const selectPart = (part) => {
        setSelectedPart(part);
        setNumber(part.number);
        setDescription(part.description);
        setShowHistory(part.history.length > 0);
        setSearchResults([]);
        setSearchTerm('');
    };

    const selectHistoryItem = (historyItem) => {
        setPrice(historyItem.price || 0);
        setQuantity(historyItem.quantity || 1);
        setRev(historyItem.rev || '');
        setDetails(historyItem.details || '');
        setUseCustomValues(false);
    };

    const clearPartSelection = () => {
        setSelectedPart(null);
        setShowHistory(false);
        setUseCustomValues(false);
        resetFields();
    };

    return (
        <div className='container'>
            <h2 className='header'>Add Part</h2>
            
            {/* Part Search Section */}
            <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}>
                <h3>Search Existing Parts</h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <input
                        type='text'
                        placeholder='Search by part number or description...'
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ flex: 1 }}
                    />
                    <button type='button' onClick={searchParts}>Search</button>
                    <button type='button' onClick={clearPartSelection}>Clear</button>
                </div>

                {searchResults.length > 0 && (
                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
                        {searchResults.map((part) => (
                            <div
                                key={part.id}
                                onClick={() => selectPart(part)}
                                style={{
                                    padding: '8px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #eee',
                                    '&:hover': { backgroundColor: '#f5f5f5' }
                                }}
                            >
                                <strong>{part.number}</strong> - {part.description}
                                {part.history.length > 0 && <span style={{ color: '#666', fontSize: '12px' }}> ({part.history.length} job(s))</span>}
                            </div>
                        ))}
                    </div>
                )}

                {selectedPart && (
                    <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f0f0f0' }}>
                        <strong>Selected: {selectedPart.number}</strong> - {selectedPart.description}
                    </div>
                )}
            </div>

            {/* Historical Data Section */}
            {showHistory && selectedPart?.history.length > 0 && (
                <div style={{ marginBottom: '20px', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}>
                    <h3>Historical Job Data</h3>
                    <div style={{ marginBottom: '10px' }}>
                        <label>
                            <input
                                type="radio"
                                checked={!useCustomValues}
                                onChange={() => setUseCustomValues(false)}
                            />
                            Use historical data
                        </label>
                        <label style={{ marginLeft: '20px' }}>
                            <input
                                type="radio"
                                checked={useCustomValues}
                                onChange={() => setUseCustomValues(true)}
                            />
                            Enter custom values
                        </label>
                    </div>

                    {!useCustomValues && (
                        <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
                            {selectedPart.history.map((item, index) => (
                                <div
                                    key={index}
                                    onClick={() => selectHistoryItem(item)}
                                    style={{
                                        padding: '8px',
                                        cursor: 'pointer',
                                        border: '1px solid #ccc',
                                        marginBottom: '5px',
                                        backgroundColor: '#fff'
                                    }}
                                >
                                    <div><strong>Job:</strong> {item.job_number} | <strong>Price:</strong> ${item.price} | <strong>Qty:</strong> {item.quantity}</div>
                                    <div><strong>Rev:</strong> {item.rev || 'N/A'} | <strong>Details:</strong> {item.details || 'N/A'}</div>
                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                        {new Date(item.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

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
                    disabled={!useCustomValues && showHistory && selectedPart?.history.length > 0}
                />
                
                <input
                    type='text'
                    placeholder='Revision'
                    value={rev}
                    onChange={(e) => setRev(e.target.value)}
                    disabled={!useCustomValues && showHistory && selectedPart?.history.length > 0}
                />
                
                {accessLevel > 1 && (
                    <div>
                        <p>Unit Price</p>
                        <input
                            type='number'
                            placeholder='Unit Price'
                            value={unitPrice}
                            onChange={(e) => setPrice(e.target.value)}
                            disabled={!useCustomValues && showHistory && selectedPart?.history.length > 0}
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
                    disabled={!useCustomValues && showHistory && selectedPart?.history.length > 0}
                />
                {errors.quantity && <div style={{ color: 'red', fontSize: '12px' }}>{errors.quantity}</div>}
                
                {/* File upload section - only show for new parts or when using custom values */}
                {(!selectedPart || useCustomValues) && (
                    <>
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
                    </>
                )}
                
                <button type='submit'>Add Part</button>
            </form>
        </div>
    );
};

export default AddPart;
