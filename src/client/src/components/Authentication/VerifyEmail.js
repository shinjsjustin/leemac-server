import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

import '../Styling/Form.css'

const VerifyEmail = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [message, setMessage] = useState('Verifying...');

    useEffect(() => {
        const confirm = async() => {
            try{
                const response = await apiFetch('/admin/verify-email/confirm', {
                    method: 'POST',
                    body: { token },
                });
                const data = await response.json();
                setMessage(response.ok ? 'Email verified' : (data.error || 'Server side error'));
            }catch(err){
                setMessage(`${err}`);
                console.error(err)
            }
        };
        confirm();
    }, [token]);

  return (
    <div className='container'>
        <h1 className='header'>Verify Email</h1>
        <p>{message}</p>
    </div>
  );
};

export default VerifyEmail;
