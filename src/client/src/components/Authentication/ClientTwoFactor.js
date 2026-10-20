import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

import '../Styling/Form.css'

const ClientTwoFactor = () => {
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');

    const handleVerify = async(e) => {
        e.preventDefault();
        setError('');
        const pendingToken = sessionStorage.getItem('clientMfaPending');

        try{
            const response = await apiFetch('/client/mfa/verify', {
                method: 'POST',
                body: { pendingToken, code },
            });
            if(response.status === 401){
                sessionStorage.removeItem('clientMfaPending');
                navigate('/client-login');
                return;
            }
            const data = await response.json();
            if(response.ok && data.token){
                localStorage.setItem('token', data.token);
                sessionStorage.removeItem('clientMfaPending');
                navigate('/client-home');
            }else{
                setError(data.error || 'Server side error');
            }
        }catch(err){
            setError(`${err}`);
            console.error(err)
        }
    };

    return (
        <div className='container'>
            <h1 className='header'>Two-Factor Authentication</h1>
            <form className='container-form' onSubmit={handleVerify}>
                <input
                    type="text"
                    placeholder='Code or backup code'
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                />
                <button type='submit'>Verify</button>
            </form>
            {error && <p>{error}</p>}
        </div>
    );
};

export default ClientTwoFactor;
