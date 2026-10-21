import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';

import '../Styling/Form.css'

const AcceptInvite = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async(e) => {
        e.preventDefault();
        setError('');

        if(password !== confirmPassword){
            setError('Passwords do not match');
            return;
        }

        try{
            const response = await apiFetch('/client/accept-invite', {
                method: 'POST',
                body: { token, password },
            });
            if(response.status === 429){
                setError(tooManyAttemptsMessage(response));
                return;
            }
            const data = await response.json();

            if(response.status === 201){
                localStorage.setItem('token', data.token);
                navigate('/client-home');
            }else{
                setError(data.error || 'Server side error')
            }
        }catch(err){
            setError(`${err}`);
            console.error(err)
        }
    };

  return (
    <div className='container'>
        <h1 className='header'>Accept Invite</h1>
        <form className='container-form' onSubmit={handleSubmit}>
            <input 
                type="password"
                placeholder='Password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
            />
            <input 
                type="password"
                placeholder='Confirm password'
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
            />
            <button type='submit'>Set Password</button>
        </form>
        {error && <p>{error}</p>}
    </div>
  );
};

export default AcceptInvite;
