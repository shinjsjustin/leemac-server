import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';
import PortalLayout from '../ClientComponents/PortalLayout';

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
            if(response.status === 429){
                setError(tooManyAttemptsMessage(response));
                return;
            }
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
        <PortalLayout title="Two-step check" signedIn={false}>
            <form className="portal-form" onSubmit={handleVerify}>
                <label className="portal-label" htmlFor="client-two-factor-code">Code or backup code</label>
                <input
                    className="portal-input"
                    id="client-two-factor-code"
                    name="code"
                    type="text"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                />
                <button className="portal-button" type="submit">Verify</button>
            </form>
            {error && <p className="portal-error" role="alert">{error}</p>}
        </PortalLayout>
    );
};

export default ClientTwoFactor;
