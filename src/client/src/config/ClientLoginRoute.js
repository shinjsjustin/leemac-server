import { jwtDecode } from 'jwt-decode';
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAllowed } from './access';
import { nextQuery } from '../components/Authentication/clientReturnPath';

const decodeStored = () => {
  try {
    return jwtDecode(localStorage.getItem('token'));
  } catch {
    return null;
  }
};

// For client pages a copied link may open: a logged-out visitor is sent to login and brought back.
const ClientLoginRoute = ({ children }) => {
  const { pathname } = useLocation();
  const decoded = decodeStored();

  if (isAllowed(decoded, { role: 'client' })) return children;
  if (isAllowed(decoded, { role: 'admin' })) return <Navigate to="/access-denied" />;

  // UnprotectedRoute bounces any stored token away from login, so drop a dead one.
  localStorage.removeItem('token');
  return <Navigate to={`/client-login${nextQuery(pathname)}`} replace />;
};

export default ClientLoginRoute;
