import { jwtDecode } from 'jwt-decode';
import React from 'react';
import { Navigate } from 'react-router-dom';
import { isAllowed } from './access';

// Unlike UnprotectedRoute, only a valid admin token leaves the login page, so
// a saved client token or a stale one can't bounce admins to the public home.
const AdminLoginRoute = ({ children }) => {
  let decoded = null;
  try {
    decoded = jwtDecode(localStorage.getItem('token'));
  } catch (e) {
    decoded = null;
  }

  if (isAllowed(decoded, { role: 'admin', minLevel: 1 })) {
    return <Navigate to="/starred-jobs" replace />;
  }
  if (!isAllowed(decoded, { role: 'client' })) {
    localStorage.removeItem('token');
  }
  return children;
};

export default AdminLoginRoute;
