import React from 'react';
import { Link } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import AdminLayout from '../AdminLayout/AdminLayout';

const REGISTER_ACCESS = 3;
const cardStyle = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 };

const Settings = () => {
  const token = localStorage.getItem('token');
  const access = token ? jwtDecode(token).access || 0 : 0;
  const canRegisterClients = access >= REGISTER_ACCESS;

  return (
    <AdminLayout current="settings" crumb="Settings">
      <div style={cardStyle}>
        <Link to="/admin-update-credentials">Update credentials</Link>
      </div>
      {canRegisterClients && (
        <div style={cardStyle}>
          <Link to="/client-register">Register clients</Link>
        </div>
      )}
    </AdminLayout>
  );
};

export default Settings;
