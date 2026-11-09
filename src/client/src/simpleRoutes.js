import React from 'react';
import ProtectedRoute from './config/ProtectedRoute';
import SimpleOverview from './components/Simple/SimpleOverview';
import SimpleQuoted from './components/Simple/SimpleQuoted';
import QcRequests from './components/AdminComponents/QcRequests';

const SIMPLE_LEVEL = 2;

const simpleRoutes = [
  { path: '/simple-overview', element: <ProtectedRoute requiredAccessLevel={SIMPLE_LEVEL}><SimpleOverview /></ProtectedRoute> },
  { path: '/quoted', element: <ProtectedRoute requiredAccessLevel={SIMPLE_LEVEL}><SimpleQuoted /></ProtectedRoute> },
  { path: '/qc-requests', element: <ProtectedRoute requiredAccessLevel={SIMPLE_LEVEL}><QcRequests /></ProtectedRoute> },
];

export default simpleRoutes;
