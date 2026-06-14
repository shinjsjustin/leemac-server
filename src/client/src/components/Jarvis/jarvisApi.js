const BASE = process.env.REACT_APP_URL || 'http://localhost:3001/api';

export async function jarvisFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const isFormData = options.body instanceof FormData;

  const headers = {
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE}/jarvis${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login-admin';
    throw new Error('Unauthorized');
  }

  return res;
}
