import React, { useState, useEffect } from 'react';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';

const ClientTwoFactorSettings = () => {
    const [enabled, setEnabled] = useState(null);
    const [setup, setSetup] = useState(null);
    const [backupCodes, setBackupCodes] = useState(null);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const call = async(path, method, body) => {
        setError('');
        try{
            const response = await apiFetch(path, { method, body });
            if(response.status === 429){
                setError(tooManyAttemptsMessage(response));
                return null;
            }
            const data = await response.json();
            if(!response.ok){
                setError(data.error || 'Server side error');
                return null;
            }
            return data;
        }catch(err){
            setError(`${err}`);
            console.error(err)
            return null;
        }
    };

    useEffect(() => {
        call('/client/mfa/status', 'GET').then((data) => {
            if (data) setEnabled(data.enabled);
        });
    }, []);

    const handleSetup = async() => {
        const data = await call('/client/mfa/totp/setup', 'POST');
        if (data) setSetup(data);
    };

    const handleEnable = async(e) => {
        e.preventDefault();
        const data = await call('/client/mfa/totp/enable', 'POST', { code });
        if (!data) return;
        setBackupCodes(data.backupCodes);
        setEnabled(true);
        setSetup(null);
        setCode('');
    };

    const handleDisable = async(e) => {
        e.preventDefault();
        const data = await call('/client/mfa/totp/disable', 'POST', { password });
        if (!data) return;
        setEnabled(false);
        setPassword('');
    };

    return (
        <div className='container-form'>
            <h2>Two-Factor Authentication</h2>
            {backupCodes && (
                <div>
                    <p>Save these backup codes now. They are shown only once.</p>
                    <ul>
                        {backupCodes.map((c) => <li key={c}>{c}</li>)}
                    </ul>
                    <button onClick={() => setBackupCodes(null)}>Done</button>
                </div>
            )}
            {enabled === false && !setup && <button onClick={handleSetup}>Turn on</button>}
            {enabled === false && setup && (
                <form onSubmit={handleEnable}>
                    <p>Add this key to your authenticator app.</p>
                    {setup.qr && <img src={setup.qr} alt='Authenticator QR code' />}
                    <code>{setup.secret}</code>
                    <input
                        type="text"
                        placeholder='Code'
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        required
                    />
                    <button type='submit'>Enable</button>
                </form>
            )}
            {enabled === true && (
                <form onSubmit={handleDisable}>
                    <p>Two-factor is on.</p>
                    <input
                        type="password"
                        placeholder='Password'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button type='submit'>Turn off</button>
                </form>
            )}
            {error && <p>{error}</p>}
        </div>
    );
};

export default ClientTwoFactorSettings;
