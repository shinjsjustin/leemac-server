import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';
import { skipWithTrustedBrowser, saveDeviceToken } from '../../api/trustedDevices';

import '../Styling/Form.css'

const TwoFactor = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [pendingToken] = useState(() => {
        const fromUrl = searchParams.get('pending');
        if (fromUrl) sessionStorage.setItem('mfaPending', fromUrl);
        return fromUrl || sessionStorage.getItem('mfaPending');
    });
    const [step, setStep] = useState('');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [trustBrowser, setTrustBrowser] = useState(false);
    const [setup, setSetup] = useState(null);
    const [backupCodes, setBackupCodes] = useState(null);
    const [sessionToken, setSessionToken] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const started = useRef(false);

    const post = async(path, extra = {}) => {
        const response = await apiFetch(path, {
            method: 'POST',
            body: { pendingToken, ...extra },
        });
        if(response.status === 429){
            setError(tooManyAttemptsMessage(response));
            return null;
        }
        if(response.status === 401){
            sessionStorage.removeItem('mfaPending');
            navigate('/login-admin');
            return null;
        }
        const data = await response.json();
        if(!response.ok){
            setError(data.error || 'Server side error');
            return null;
        }
        return data;
    };

    const finish = (token) => {
        localStorage.setItem('token', token);
        sessionStorage.removeItem('mfaPending');
        navigate('/starred-jobs');
    };

    const run = async(action) => {
        setError('');
        try{
            await action();
        }catch(err){
            setError(`${err}`);
            console.error(err)
        }
    };

    useEffect(() => {
        // StrictMode runs effects twice in dev; the setup call rotates the TOTP secret.
        if (started.current) return;
        started.current = true;
        if (!pendingToken) {
            navigate('/login-admin');
            return;
        }
        // Drop the pending token from the address bar.
        if (searchParams.get('pending')) navigate('/two-factor', { replace: true });
        run(async() => {
            const data = await post('/admin/mfa/status');
            if (!data) return;
            if (data.step === 'enter_code') {
                const trustedToken = await skipWithTrustedBrowser(pendingToken);
                if (trustedToken) {
                    finish(trustedToken);
                    return;
                }
            }
            setStep(data.step);
            if (data.step === 'setup_totp') {
                const setupData = await post('/admin/mfa/totp/setup');
                if (setupData) setSetup(setupData);
            }
        });
    }, []);

    const handleEmail = (e) => {
        e.preventDefault();
        run(async() => {
            const data = await post('/admin/mfa/email', { email });
            if (data) setMessage('Check your inbox, click the link, then log in again.');
        });
    };

    const handleEnable = (e) => {
        e.preventDefault();
        run(async() => {
            const data = await post('/admin/mfa/totp/enable', { code });
            if (!data) return;
            setSessionToken(data.token);
            setBackupCodes(data.backupCodes);
        });
    };

    const handleVerify = (e) => {
        e.preventDefault();
        run(async() => {
            const data = await post('/admin/mfa/verify', { code, trustBrowser });
            if (!data) return;
            if (data.deviceToken) saveDeviceToken(data.deviceToken);
            finish(data.token);
        });
    };

    const codeInput = (
        <input
            type="text"
            placeholder='Code or backup code'
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
        />
    );

    return (
        <div className='container'>
            <h1 className='header'>Two-Factor Authentication</h1>
            {step === 'verify_email' && (
                message ? <p>{message}</p> : (
                    <form className='container-form' onSubmit={handleEmail}>
                        <p>Enter your email address to verify it.</p>
                        <input
                            type="email"
                            placeholder='Email'
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <button type='submit'>Send link</button>
                    </form>
                )
            )}
            {step === 'setup_totp' && backupCodes && (
                <div>
                    <p>Save these backup codes now. They are shown only once.</p>
                    <ul>
                        {backupCodes.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    <button onClick={() => finish(sessionToken)}>Continue</button>
                </div>
            )}
            {step === 'setup_totp' && !backupCodes && setup && (
                <form className='container-form' onSubmit={handleEnable}>
                    <p>Add this key to your authenticator app.</p>
                    {setup.qr && <img src={setup.qr} alt='Authenticator QR code' />}
                    <code>{setup.secret}</code>
                    {codeInput}
                    <button type='submit'>Enable</button>
                </form>
            )}
            {step === 'enter_code' && (
                <form className='container-form' onSubmit={handleVerify}>
                    {codeInput}
                    <label>
                        <input
                            type="checkbox"
                            checked={trustBrowser}
                            onChange={(e) => setTrustBrowser(e.target.checked)}
                        />
                        Trust this browser for 30 days
                    </label>
                    <button type='submit'>Verify</button>
                </form>
            )}
            {error && <p>{error}</p>}
        </div>
    );
};

export default TwoFactor;
