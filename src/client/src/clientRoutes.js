import React from 'react';
import { Navigate } from 'react-router-dom';
import ClientHome from './components/ClientComponents/ClientHome';
import ClientJob from './components/ClientComponents/ClientJob';
import ProtectedRoute from './config/ProtectedRoute';

// The old parts pages are gone; keep their URLs working for bookmarks.
const toHome = <Navigate to="/client-home" replace />;

const clientRoutes = [
  { path: '/client-home', element: <ProtectedRoute role="client"><ClientHome /></ProtectedRoute> },
  { path: '/client-job/:id', element: <ProtectedRoute role="client"><ClientJob /></ProtectedRoute> },
  { path: '/client-parts', element: <ProtectedRoute role="client">{toHome}</ProtectedRoute> },
  { path: '/client-part/:id', element: <ProtectedRoute role="client">{toHome}</ProtectedRoute> },
];

export default clientRoutes;
