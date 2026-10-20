import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

import '../Styling/Form.css'

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
    <div className='container'>
        <h1 className='header'>Client Log In</h1>
        <form className='container-form'onSubmit={handleLogin}>
            <input 
                type="email"
                placeholder='Email'
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
            />
            <input 
                type="password"
                placeholder='Password'
                value={password}
                onChange={(e)=> setPassword(e.target.value)}
                required
            />
            <button type='submit'>Login</button>
            <Link to="/forgot-password">Forgot password?</Link>
            <Link to="/">Home</Link>
        </form>
        {error && <p>{error}</p>}
    </div>
  );
};

export default ClientLogin;