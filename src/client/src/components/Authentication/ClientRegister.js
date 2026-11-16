import React, { useCallback, useEffect, useState } from 'react';
import { listCompanies, inviteClient } from '../../api/clientInviteApi';
import { companyChoices } from './companyChoices';

import '../Styling/Form.css'
import AdminLayout from '../AdminLayout/AdminLayout';

// The company select shows as an open list so admins see the A-Z choices without opening it.
const MIN_LIST_ROWS = 2;
const MAX_LIST_ROWS = 8;

const ClientRegister = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [filter, setFilter] = useState('');
    const [companies, setCompanies] = useState([]);
    const [isLoadFailed, setIsLoadFailed] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const choices = companyChoices(companies, filter);

    const loadCompanies = useCallback(async () => {
        setIsLoadFailed(false);
        const result = await listCompanies();
        if (result.ok) setCompanies(result.companies);
        else setIsLoadFailed(true);
    }, []);

    useEffect(() => { loadCompanies(); }, [loadCompanies]);

    const inviteUser = async(e) =>{
        e.preventDefault();
        if(!companyId) return;
        setError('');
        setMessage('');

        const result = await inviteClient({ email, name, companyId: Number(companyId) });
        if(result.ok){
            setMessage('Invite sent')
            setName('');
            setEmail('');
            setCompanyId('');
            setFilter('');
        }else{
            setError(result.error)
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
            {isLoadFailed ? (
                <div>
                    <p>Couldn't load companies</p>
                    <button type='button' onClick={loadCompanies}>Retry</button>
                </div>
            ) : (
                <>
                    <input
                        type="text"
                        placeholder='Filter companies'
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <select
                        value={companyId}
                        onChange={(e) => setCompanyId(e.target.value)}
                        required
                        size={Math.min(Math.max(choices.length + 1, MIN_LIST_ROWS), MAX_LIST_ROWS)}
                    >
                        <option value="">Choose a company</option>
                        {choices.map((c) => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                    </select>
                </>
            )}
            <button type='submit' disabled={!companyId || isLoadFailed}>Send Invite</button>
        </form>
        {message && <p>{message}</p>}
        {error && <p>{error}</p>}
    </div>
    </AdminLayout>
  );
};

export default ClientRegister;
