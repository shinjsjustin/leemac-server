import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { apiFetch } from '../../api/apiFetch';
import AdminLayout from '../AdminLayout/AdminLayout';

const GOOGLE_ACCESS = 3;
const MAX_PREVIEW = 5;
const cardStyle = { background: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 };

const Settings = () => {
  const [gmail, setGmail] = useState(null);
  const [error, setError] = useState('');
  const params = new URLSearchParams(useLocation().search);
  const token = localStorage.getItem('token');
  const access = token ? jwtDecode(token).access || 0 : 0;
  const canUseGoogle = access >= GOOGLE_ACCESS;

  const connectGoogle = async () => {
    setError('');
    try {
      const res = await apiFetch('/jarvis/google/auth-url');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start Google connection');
        return;
      }
      window.location.href = data.authUrl;
    } catch (err) {
      console.error('Error starting Google connection:', err);
      setError('Error starting Google connection');
    }
  };

  const checkGmail = async () => {
    setError('');
    setGmail(null);
    try {
      const res = await apiFetch('/jarvis/google/check');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to check Gmail access');
        return;
      }
      setGmail({ count: data.count, emails: (data.emails || []).slice(0, MAX_PREVIEW) });
    } catch (err) {
      console.error('Error checking Gmail access:', err);
      setError('Error checking Gmail access');
    }
  };

  const callbackError = params.get('google_error');

  return (
    <AdminLayout current="settings" crumb="Settings">
      {params.get('google_connected') === '1' && <p>Google connected.</p>}
      {callbackError && <p role="alert">Google connection failed: {callbackError}</p>}
      {error && <p role="alert">{error}</p>}
      <div style={cardStyle}>
        <Link to="/admin-update-credentials">Update credentials</Link>
      </div>
      {canUseGoogle && (
        <>
          <div style={cardStyle}>
            <button onClick={connectGoogle}>Connect Google</button>
            <button onClick={checkGmail}>Check Gmail</button>
            {gmail && (
              <div>
                <p>{gmail.count} messages</p>
                <ul>
                  {gmail.emails.map((email, i) => (
                    <li key={i}>{email.from} - {email.subject}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div style={cardStyle}>
            <Link to="/client-register">Register clients</Link>
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default Settings;
