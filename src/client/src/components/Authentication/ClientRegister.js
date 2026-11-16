import React, { useCallback, useEffect, useState } from 'react';
import { listCompanies, inviteClient } from '../../api/clientInviteApi';
import { companyChoices } from './companyChoices';

import '../Styling/Form.css'
import AdminLayout from '../AdminLayout/AdminLayout';

const ClientRegister = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [filter, setFilter] = useState('');
    const [companies, setCompanies] = useState([]);
    const [isLoadFailed, setIsLoadFailed] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

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
                    >
                        <option value="">Choose a company</option>
                        {companyChoices(companies, filter).map((c) => (
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
