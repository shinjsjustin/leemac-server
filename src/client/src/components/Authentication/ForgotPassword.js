import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

import '../Styling/Form.css'

const ForgotPassword = () => {
    const [type, setType] = useState('admin');
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);

    const handleSubmit = async(e) => {
        e.preventDefault();

        try{
            await apiFetch(`/${type}/forgot-password`, {
                method: 'POST',
                body: { email },
            });
        }catch(err){
            console.error(err)
        }
        // Same message whatever happened, so the page never reveals which emails exist.
        setSent(true);
    };

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
        {sent && <p>If that email exists, a link is on its way</p>}
    </div>
  );
};

export default ForgotPassword;
