import React, { useState } from 'react';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';

import '../Styling/Form.css'
import AdminLayout from '../AdminLayout/AdminLayout';

const ClientRegister = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [company_id, setcompany_id] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const inviteUser = async(e) =>{
        e.preventDefault();
        setError('');
        setMessage('');
        const body = { email, name, company_id: parseInt(company_id) }

        try{
            const response = await apiFetch('/client/invite', {
                method: 'POST',
                body,
            });
            if(response.status === 429){
                setError(tooManyAttemptsMessage(response));
                return;
            }
            const data = await response.json();

            if(response.status === 201){
                setMessage('Invite sent')
                setName('');
                setEmail('');
                setcompany_id('');
            }else{
                setError(data.error || 'Server side error')
            }
        }catch(err){
            setError('Invite error (try catch)')
            console.error(err)
        }
    }

  return (
    <AdminLayout current="settings" crumb="Register clients">
    <div className='container'>
        <h1 className='header'>Invite Client</h1>
        <form className='container-form' onSubmit={inviteUser}>
            <input 
                type="email"
                placeholder='Email'
                value={email}
                onChange={(e) => setEmail(e.target.value)} 
                required
            />
            <input 
                type="text"
                placeholder='Name'
                value={name}
                onChange={(e) => setName(e.target.value)} 
                required
            />
            <input 
                type="number"
                placeholder='Company ID'
                value={company_id}
                onChange={(e) => setcompany_id(e.target.value)} 
                required
            />
            <button type='submit'>Send Invite</button>
        </form>
        {message && <p>{message}</p>}
        {error && <p>{error}</p>}
    </div>
    </AdminLayout>
  );
};

export default ClientRegister;
