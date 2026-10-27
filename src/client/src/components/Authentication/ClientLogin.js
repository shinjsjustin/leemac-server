import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';
import PortalLayout from '../ClientComponents/PortalLayout';

const ClientLogin = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async(e) => {
        e.preventDefault();
        setError('');

        try{
            const response = await apiFetch('/client/login', {
                method: 'POST',
                body: { email, password },
            });
            if(response.status === 429){
                setError(tooManyAttemptsMessage(response));
                return;
            }
            const data = await response.json();
            // console.log('Login request data: ', data);
    
            if(response.status === 200 && data.pendingToken){
                sessionStorage.setItem('clientMfaPending', data.pendingToken);
                navigate('/client-two-factor');
            }else if(response.status === 200){
                localStorage.setItem('token', data.token);
                navigate('/client-home');
            }else if(response.status === 401 || response.status === 423){
                setError(data.error)
            }else{
                setError('Server side error')
            }
        }catch(err){
            setError(`${err}`);
            console.error(err)
        }
    };

  return (
    <PortalLayout title="Sign in" signedIn={false}>
        <form className="portal-form" onSubmit={handleLogin}>
            <label className="portal-label" htmlFor="client-login-email">Email</label>
            <input
                className="portal-input"
                id="client-login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />
            <label className="portal-label" htmlFor="client-login-password">Password</label>
            <input
                className="portal-input"
                id="client-login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
            />
            <button className="portal-button" type="submit">Login</button>
            <Link to="/forgot-password">Forgot password?</Link>
            <Link to="/">Home</Link>
        </form>
        {error && <p className="portal-error" role="alert">{error}</p>}
    </PortalLayout>
  );
};

export default ClientLogin;