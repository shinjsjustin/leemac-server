import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';
import PortalLayout from '../ClientComponents/PortalLayout';

import '../Styling/Form.css'

const ResetPassword = () => {
    const [searchParams] = useSearchParams();
    const type = searchParams.get('type') === 'client' ? 'client' : 'admin';
    const token = searchParams.get('token');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async(e) => {
        e.preventDefault();
        setError('');

        if(newPassword !== confirmPassword){
            setError('Passwords do not match');
            return;
        }

        try{
            const response = await apiFetch(`/${type}/reset-password`, {
                method: 'POST',
                body: { token, newPassword },
            });
            if(response.status === 429){
                setError(tooManyAttemptsMessage(response));
                return;
            }
            const data = await response.json();

            if(response.ok){
                setDone(true);
            }else{
                setError(data.error || 'Server side error')
            }
        }catch(err){
            setError(`${err}`);
            console.error(err)
        }
    };

  if(type === 'client'){
    return (
      <PortalLayout title="Reset your password" signedIn={false}>
        {done ? (
            <p>
                Password updated. <Link to="/client-login">Log in</Link>
            </p>
        ) : (
            <form className="portal-form" onSubmit={handleSubmit}>
                <label className="portal-label" htmlFor="client-reset-new">New password</label>
                <input
                    className="portal-input"
                    id="client-reset-new"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                />
                <label className="portal-label" htmlFor="client-reset-confirm">Confirm password</label>
                <input
                    className="portal-input"
                    id="client-reset-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                />
                <button className="portal-button" type="submit">Reset Password</button>
            </form>
        )}
        {error && <p className="portal-error" role="alert">{error}</p>}
      </PortalLayout>
    );
  }

  return (
    <div className='container'>
        <h1 className='header'>Reset Password</h1>
        {done ? (
            <p>
                Password updated. <Link to={type === 'client' ? '/client-login' : '/login-admin'}>Log in</Link>
            </p>
        ) : (
            <form className='container-form' onSubmit={handleSubmit}>
                <input 
                    type="password"
                    placeholder='New password'
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                />
                <input 
                    type="password"
                    placeholder='Confirm password'
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                />
                <button type='submit'>Reset Password</button>
            </form>
        )}
        {error && <p>{error}</p>}
    </div>
  );
};

export default ResetPassword;
