import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';
import ClientTwoFactorSettings from './ClientTwoFactorSettings';
import { apiFetch, tooManyAttemptsMessage } from '../../api/apiFetch';

const ClientUpdateCredentials = () => {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        currentPassword: '',
        newPassword: ''
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        // Clear error when user starts typing
        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    const validateForm = () => {
        const newErrors = {};
        
        if (!formData.currentPassword.trim()) {
            newErrors.currentPassword = 'Current password is required';
        }
        
        if (!formData.newPassword.trim()) {
            newErrors.general = 'Please enter a new password';
        }
        
        return newErrors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const validationErrors = validateForm();
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }
        
        setLoading(true);
        setErrors({});
        
        try {
            const passwordResponse = await apiFetch('/client/change-password', {
                method: 'PUT',
                body: {
                    currentPassword: formData.currentPassword,
                    newPassword: formData.newPassword
                },
            });
            if(passwordResponse.status === 429){
                setErrors({ general: tooManyAttemptsMessage(passwordResponse) });
                return;
            }
            
            const passwordData = await passwordResponse.json();
            
            if (!passwordResponse.ok) {
                throw new Error(passwordData.error || 'Failed to update password');
            }
            
            alert('Credentials updated successfully! Please log in again.');
            localStorage.removeItem('token'); // Force re-login
            navigate('/client-login');
            
        } catch (error) {
            setErrors({ general: error.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <Navbar />
            <div className='container'>
                <button 
                    onClick={() => navigate(-1)}
                    style={{
                        marginBottom: '20px',
                        padding: '10px 20px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    }}
                >
                    ← Back
                </button>
                
                <h1 className='header'>Update Client Credentials</h1>
                
                <form className='container-form' onSubmit={handleSubmit}>
                    <div>
                        <label>Current Password:</label>
                        <input
                            type="password"
                            name="currentPassword"
                            value={formData.currentPassword}
                            onChange={handleInputChange}
                            required
                        />
                        {errors.currentPassword && <div style={{ color: 'red', fontSize: '12px' }}>{errors.currentPassword}</div>}
                    </div>
                    
                    <div>
                        <label>New Password:</label>
                        <input
                            type="password"
                            name="newPassword"
                            value={formData.newPassword}
                            onChange={handleInputChange}
                            required
                        />
                    </div>
                    
                    {errors.general && <div style={{ color: 'red', fontSize: '12px', textAlign: 'center' }}>{errors.general}</div>}
                    
                    <button 
                        type="submit" 
                        disabled={loading}
                        style={{ 
                            cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {loading ? 'Updating...' : 'Update Credentials'}
                    </button>
                </form>

                <ClientTwoFactorSettings />
            </div>
        </div>
    );
};

export default ClientUpdateCredentials;
