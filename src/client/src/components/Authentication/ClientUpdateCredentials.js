import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalLayout from '../ClientComponents/PortalLayout';
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
        <PortalLayout title="Account">
            <form className="portal-form" onSubmit={handleSubmit}>
                <label className="portal-label" htmlFor="account-current-password">Current password</label>
                <input
                    className="portal-input"
                    id="account-current-password"
                    type="password"
                    name="currentPassword"
                    autoComplete="current-password"
                    value={formData.currentPassword}
                    onChange={handleInputChange}
                    required
                />
                {errors.currentPassword && <p className="portal-error">{errors.currentPassword}</p>}
                <label className="portal-label" htmlFor="account-new-password">New password</label>
                <input
                    className="portal-input"
                    id="account-new-password"
                    type="password"
                    name="newPassword"
                    autoComplete="new-password"
                    value={formData.newPassword}
                    onChange={handleInputChange}
                    required
                />
                {errors.general && <p className="portal-error" role="alert">{errors.general}</p>}
                <button className="portal-button" type="submit" disabled={loading}>
                    {loading ? 'Updating...' : 'Update Credentials'}
                </button>
            </form>

            <ClientTwoFactorSettings />
        </PortalLayout>
    );
};

export default ClientUpdateCredentials;
