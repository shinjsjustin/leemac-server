import React from 'react';
import { Navigate } from 'react-router-dom';

// Wraps auth pages (login, register) so that already-logged-in users
// are redirected to the dashboard instead of seeing the form again.
const UnprotectedRoute = ({ children }) => {
    const token = localStorage.getItem('token');

    if (token) {
        return <Navigate to="/dashboard" />;
    }

    return children;
};

export default UnprotectedRoute;
