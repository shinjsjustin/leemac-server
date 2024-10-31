import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom';

import './Styling/Form.css'

const RequestQuote = () =>{
    const [name, setName] = useState('');
    const [title, setTitle] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [description, setDescription] = useState('');
    const [error, setError] = useState('');
    const [files, setFiles] = useState([]);

    const navigate = useNavigate();

    const handleFileChange = (e) => {
        setFiles(e.target.files);
    };

    const postRequest = async(e) => {
        e.preventDefault();

        const phoneValue = phone && phone.trim() !== '' ? phone : null;
        console.log('phone: ', phone, 'phoneValue: ', phoneValue)
        try{
            const response = await fetch(`${process.env.REACT_APP_URL}/quote/new`,{
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({name, email, phoneValue, description, title})
            });
            
            const data = await response.json();

            if(response.status ===201){
                navigate('/')
                console.log(data.id)
                
                if(files.length > 0){
                    for (let i = 0; i < files.length; i++) {
                        const formData = new FormData();
                    
                        formData.append('files', files[i]);
                        formData.append('quoteID', data.id)
                        const fileResponse = await fetch(`${process.env.REACT_APP_URL}/quote/file`, {
                            method: 'POST',
                            body: formData,
                            headers: {},
                        });
            
                        if (!response.ok) {
                            throw new Error('File upload failed');
                        }
            
                        const fileData = await fileResponse.json();
                        console.log('file data: ', fileData);    
                    }
                    
                }
            }else{
                setError('WEEWOOWEEWOO')
                console.error(data)
            }
        }catch(e){
            setError('An error has occured during posting part')
            console.error(e)
        }
    }

    return (
        <div className='container'>
            <h1 className='header'>Request Quote</h1>
            <form className='container-form' onSubmit={postRequest}>
                <input 
                    type="text"
                    placeholder='Name'
                    value={name}
                    onChange={(e) => setName(e.target.value)} 
                    required
                />
                <input 
                    type="email"
                    placeholder='Email'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)} 
                    required
                />
                <input 
                    type="phone"
                    placeholder='Phone (optional)'
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)} 
                />
                <input 
                    type="text"
                    placeholder='Part Title'
                    value={title}
                    onChange={(e) => setTitle(e.target.value)} 
                />
                <textarea 
                    type="text"
                    placeholder='Description'
                    value={description}
                    onChange={(e) => setDescription(e.target.value)} 
                />
                <input type="file" multiple onChange={handleFileChange} />
                <button type='submit'>Submit</button>
                <Link to="/">Home</Link>
            </form>
            {error && <p>{error}</p>}
        </div>
    );
};

export default RequestQuote;