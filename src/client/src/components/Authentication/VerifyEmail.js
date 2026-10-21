import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';

import '../Styling/Form.css'

const VerifyEmail = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [message, setMessage] = useState('Verifying...');

    const postedToken = useRef(null);

    useEffect(() => {
        // StrictMode runs effects twice in dev; the token is single-use.
        if (postedToken.current === token) return;
        postedToken.current = token;
        const confirm = async() => {
            try{
                const response = await apiFetch('/admin/verify-email/confirm', {
                    method: 'POST',
                    body: { token },
                });
                if(response.status === 429){
                    setMessage(tooManyAttemptsMessage(response));
                    return;
                }
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
