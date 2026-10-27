import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';
import PortalLayout from '../ClientComponents/PortalLayout';

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
    <PortalLayout title="Set your password" signedIn={false}>
        <form className="portal-form" onSubmit={handleSubmit}>
            <label className="portal-label" htmlFor="password">Password</label>
            <input
                className="portal-input"
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
            />
            <label className="portal-label" htmlFor="confirmPassword">Confirm password</label>
            <input
                className="portal-input"
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
            />
            <button className="portal-button" type="submit">Set password</button>
        </form>
        {error && <p className="portal-error" role="alert">{error}</p>}
    </PortalLayout>
  );
};

export default AcceptInvite;
