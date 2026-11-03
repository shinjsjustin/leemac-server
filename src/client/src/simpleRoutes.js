import React from 'react';
import ProtectedRoute from './config/ProtectedRoute';
import SimpleOverview from './components/Simple/SimpleOverview';

const SIMPLE_LEVEL = 2;

const simpleRoutes = [
  { path: '/simple-overview', element: <ProtectedRoute requiredAccessLevel={SIMPLE_LEVEL}><SimpleOverview /></ProtectedRoute> },
];

export default simpleRoutes;
