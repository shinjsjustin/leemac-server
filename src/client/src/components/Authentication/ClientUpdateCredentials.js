import React, { useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';

const ClientUpdateCredentials = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const currentUsername = decodedToken?.username || '';
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        currentUsername: currentUsername,
        currentPassword: '',
        newUsername: '',
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
        
        if (!formData.currentUsername.trim()) {
            newErrors.currentUsername = 'Current username is required';
        }
        
        if (!formData.currentPassword.trim()) {
            newErrors.currentPassword = 'Current password is required';
        }
        
        if (!formData.newUsername.trim() && !formData.newPassword.trim()) {
            newErrors.general = 'Please fill in either new username or new password (or both)';
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
            // Determine which updates to perform
            const shouldUpdateUsername = formData.newUsername.trim() && formData.newUsername !== formData.currentUsername;
            const shouldUpdatePassword = formData.newPassword.trim();
            
            if (shouldUpdateUsername) {
                const usernameResponse = await fetch(`${process.env.REACT_APP_URL}/client/change-username`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        currentUsername: formData.currentUsername,
                        newUsername: formData.newUsername,
                        password: formData.currentPassword
                    }),
                });
                
                const usernameData = await usernameResponse.json();
                
                if (!usernameResponse.ok) {
                    throw new Error(usernameData.error || 'Failed to update username');
                }
            }
            
            if (shouldUpdatePassword) {
                const passwordResponse = await fetch(`${process.env.REACT_APP_URL}/client/change-password`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username: shouldUpdateUsername ? formData.newUsername : formData.currentUsername,
                        currentPassword: formData.currentPassword,
                        newPassword: formData.newPassword
                    }),
                });
                
                const passwordData = await passwordResponse.json();
                
                if (!passwordResponse.ok) {
                    throw new Error(passwordData.error || 'Failed to update password');
                }
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
                        <label>Current Username:</label>
                        <input
                            type="text"
                            name="currentUsername"
                            value={formData.currentUsername}
                            onChange={handleInputChange}
                            required
                        />
                        {errors.currentUsername && <div style={{ color: 'red', fontSize: '12px' }}>{errors.currentUsername}</div>}
                    </div>
                    
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
                        <label>New Username (optional):</label>
                        <input
                            type="text"
                            name="newUsername"
                            value={formData.newUsername}
                            onChange={handleInputChange}
                            placeholder="Leave empty to keep current username"
                        />
                    </div>
                    
                    <div>
                        <label>New Password (optional):</label>
                        <input
                            type="password"
                            name="newPassword"
                            value={formData.newPassword}
                            onChange={handleInputChange}
                            placeholder="Leave empty to keep current password"
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
            </div>
        </div>
    );
};

export default ClientUpdateCredentials;
