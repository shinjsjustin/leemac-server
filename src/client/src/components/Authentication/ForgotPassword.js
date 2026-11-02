import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';
import PortalLayout from '../ClientComponents/PortalLayout';

import '../Styling/Form.css'

const ForgotPassword = () => {
    const [searchParams] = useSearchParams();
    const isClient = searchParams.get('type') === 'client';
    const [adminType, setType] = useState('admin');
    const type = isClient ? 'client' : adminType;
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [limitMessage, setLimitMessage] = useState('');

    const handleSubmit = async(e) => {
        e.preventDefault();
        setLimitMessage('');

        try{
            const response = await apiFetch(`/${type}/forgot-password`, {
                method: 'POST',
                body: { email },
            });
            if(response.status === 429){
                setLimitMessage(tooManyAttemptsMessage(response));
                return;
            }
        }catch(err){
            console.error(err)
        }
        // Same message whatever happened, so the page never reveals which emails exist.
        setSent(true);
    };

  if(isClient){
    return (
      <PortalLayout title="Reset your password" signedIn={false}>
        <form className="portal-form" onSubmit={handleSubmit}>
            <label className="portal-label" htmlFor="client-forgot-email">Email</label>
            <input
                className="portal-input"
                id="client-forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />
            <button className="portal-button" type="submit">Send Reset Link</button>
            <Link to="/client-login">Back to sign in</Link>
        </form>
        {limitMessage && <p className="portal-error" role="alert">{limitMessage}</p>}
        {sent && <p>If that email exists, a link is on its way</p>}
      </PortalLayout>
    );
  }

  return (
    <div className='container'>
        <h1 className='header'>Forgot Password</h1>
        <form className='container-form' onSubmit={handleSubmit}>
            <select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="admin">Admin</option>
                <option value="client">Client</option>
            </select>
            <input 
                type="email"
                placeholder='Email'
                value={email}
                onChange={(e) => setEmail(e.target.value)} 
                required
            />
            <button type='submit'>Send Reset Link</button>
            <Link to="/">Home</Link>
        </form>
        {limitMessage && <p>{limitMessage}</p>}
        {sent && <p>If that email exists, a link is on its way</p>}
    </div>
  );
};

export default ForgotPassword;
