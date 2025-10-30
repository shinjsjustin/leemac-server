import React, { useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';
import Navbar from '../Navbar';

const AdminUpdateCredentials = () => {
    const token = localStorage.getItem('token');
    const decodedToken = token ? jwtDecode(token) : null;
    const currentEmail = decodedToken?.email || '';
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        currentEmail: currentEmail,
        currentPassword: '',
        newEmail: '',
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
        
        if (!formData.currentEmail.trim()) {
            newErrors.currentEmail = 'Current email is required';
        }
        
        if (!formData.currentPassword.trim()) {
            newErrors.currentPassword = 'Current password is required';
        }
        
        if (!formData.newEmail.trim() && !formData.newPassword.trim()) {
            newErrors.general = 'Please fill in either new email or new password (or both)';
        }
        
        // Basic email validation for new email if provided
        if (formData.newEmail.trim() && !/\S+@\S+\.\S+/.test(formData.newEmail)) {
            newErrors.newEmail = 'Please enter a valid email address';
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
            const shouldUpdateEmail = formData.newEmail.trim() && formData.newEmail !== formData.currentEmail;
            const shouldUpdatePassword = formData.newPassword.trim();
            
            if (shouldUpdateEmail) {
                const emailResponse = await fetch(`${process.env.REACT_APP_URL}/admin/change-email`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        currentEmail: formData.currentEmail,
                        newEmail: formData.newEmail,
                        password: formData.currentPassword
                    }),
                });
                
                const emailData = await emailResponse.json();
                
                if (!emailResponse.ok) {
                    throw new Error(emailData.error || 'Failed to update email');
                }
            }
            
            if (shouldUpdatePassword) {
                const passwordResponse = await fetch(`${process.env.REACT_APP_URL}/admin/change-password`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: shouldUpdateEmail ? formData.newEmail : formData.currentEmail,
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
            navigate('/login-admin');
            
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
                
                <h1 className='header'>Update Admin Credentials</h1>
                
                <form className='container-form' onSubmit={handleSubmit}>
                    <div>
                        <label>Current Email:</label>
                        <input
                            type="email"
                            name="currentEmail"
                            value={formData.currentEmail}
                            onChange={handleInputChange}
                            required
                        />
                        {errors.currentEmail && <div style={{ color: 'red', fontSize: '12px' }}>{errors.currentEmail}</div>}
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
                        <label>New Email (optional):</label>
                        <input
                            type="email"
                            name="newEmail"
                            value={formData.newEmail}
                            onChange={handleInputChange}
                            placeholder="Leave empty to keep current email"
                        />
                        {errors.newEmail && <div style={{ color: 'red', fontSize: '12px' }}>{errors.newEmail}</div>}
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

export default AdminUpdateCredentials;
