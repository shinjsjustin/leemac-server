import React from 'react';
import ClientHome from './components/ClientComponents/ClientHome';
import ClientJob from './components/ClientComponents/ClientJob';
import ClientPartsPage from './components/ClientComponents/ClientPartsPage';
import ClientPartPage from './components/ClientComponents/ClientPartPage';
import ProtectedRoute from './config/ProtectedRoute';

const clientRoutes = [
  { path: '/client-home', element: <ProtectedRoute role="client"><ClientHome /></ProtectedRoute> },
  { path: '/client-job/:id', element: <ProtectedRoute role="client"><ClientJob /></ProtectedRoute> },
  { path: '/client-parts', element: <ProtectedRoute role="client"><ClientPartsPage /></ProtectedRoute> },
  { path: '/client-part/:id', element: <ProtectedRoute role="client"><ClientPartPage /></ProtectedRoute> },
];

export default clientRoutes;
