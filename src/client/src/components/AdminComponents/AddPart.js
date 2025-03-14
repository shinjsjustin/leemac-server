import React, { useState } from 'react';
import {useNavigate} from 'react-router-dom';

import '../Styling/RequestTable.css'

const AddPart = () => {
    const navigate = useNavigate();
    const token = localStorage.getItem('token');

    const [company, setCompany] = useState('');
    const [number, setNumber] = useState('');
    const [description, setDescription] = useState('');
    const [unitPrice, setPrice] = useState(0);
    const [files, setFiles] = useState([]);

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

    const handleGoBack = () => {
        navigate('/admin');
    };

    const removeFile = (index) => {
        setFiles(files.filter((_, i) => i !== index));
    };

    const postRequest = async (e) => {
        e.preventDefault();
        try {
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/newpart`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ number, description, unitPrice, company }),
            });
            const data = await response.json();

            if (response.status === 201 && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    const formData = new FormData();
                    formData.append('files', files[i]);
                    const fileResponse = await fetch(`${process.env.REACT_APP_URL}/internal/uploadblob?id=${data.id}`, {
                        method: 'POST',
                        body: formData,
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });

                    if (!fileResponse.ok) {
                        throw new Error('File upload failed');
                    }
                }
                navigate('/admin');
            }
        } catch (e) {
            console.error('Error:', e);
        }
    };

    return (
        <div>
            <button onClick={handleGoBack}>Back</button>
            <div className='container'>
                <h1 className='header'>Add Part</h1>
                <form className='container-form' onSubmit={postRequest}>
                    <input
                        type='text'
                        placeholder='Company'
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        required
                    />
                    <input
                        type='text'
                        placeholder='Part Number'
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        required
                    />
                    <textarea
                        type='text'
                        placeholder='Description'
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <input
                        type='number'
                        placeholder='Unit Price'
                        value={unitPrice}
                        onChange={(e) => setPrice(e.target.value)}
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
                        <h3>Files to be uploaded:</h3>
                        {files.map((file, index) => (
                            <div key={index} style={{ marginBottom: '5px' }}>
                                <span>{file.name} ({(file.size / 1024).toFixed(2)} KB)</span>
                                <button type='button' onClick={() => removeFile(index)} style={{ marginLeft: '10px' }}>
                                    Remove
                                </button>
                            </div>
                        ))}
                    </div>
                    <button type='submit'>Submit</button>
                </form>
            </div>
        </div>
    );
};

export default AddPart;