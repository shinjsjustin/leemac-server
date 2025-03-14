import React, { useState } from 'react';
import {useNavigate} from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

import '../Styling/RequestTable.css'

const AddPart = () =>{
    const navigate = useNavigate();
    const token = localStorage.getItem('token');

    const [company, setCompany] = useState('');
    const [number, setNumber] = useState('');
    const [description, setDescription] = useState('');
    const [unitPrice, setPrice] = useState(0);
    const [files, setFiles] = useState([]);

    const handleFileChange = (e) => {
        setFiles(e.target.files);
    };

    const handleGoBack = () =>{
        navigate(-1);
    }

    const postRequest = async(e) => {
        e.preventDefault();
        console.log("post request for adding part");
        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/internal/newpart`,{
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({number, description, unitPrice, company})
            });
            const data = await response.json();
            
            if(response.status === 201){
                if(files.length > 0){
                    console.log('there sure are files here')
                    for (let i=0; i<files.length; i++){
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
                        }else{
                            navigate(-1);
                        }
                    }
                }
            }
        }catch(e){

        }
    }

    return (
        <div>
            <button onClick={handleGoBack}>Back</button>
            <div className='container'>
            <h1 className='header'>Add Part</h1>
            <form className='container-form' onSubmit={postRequest}>
                <input 
                    type="text"
                    placeholder='Company'
                    value={company}
                    onChange={(e) => setCompany(e.target.value)} 
                    required
                />
                <input 
                    type="text"
                    placeholder='Part Number'
                    value={number}
                    onChange={(e) => setNumber(e.target.value)} 
                    required
                />
                <textarea 
                    type="text"
                    placeholder='Description'
                    value={description}
                    onChange={(e) => setDescription(e.target.value)} 
                />
                <input
                    type="number"
                    placeholder='Unit Price'
                    value = {unitPrice}
                    onChange={(e)=> setPrice(e.target.value)}
                />
                <input type="file" multiple onChange={handleFileChange} />
                <button type='submit'>Submit</button>
            </form>
        </div>
        </div>
    )
}

export default AddPart;