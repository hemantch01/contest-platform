import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Inject CSRF token on every mutation request
api.interceptors.request.use(async (config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    // Try to get token from cookie
    const match = document.cookie.match(/csrf-token=([^;]+)/);
    if (match) {
      config.headers['X-CSRF-Token'] = match[1];
    }
  }
  return config;
});

// Redirect on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      if (!window.location.pathname.startsWith('/auth')) {
        window.location.href = '/auth/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;

// Fetch CSRF token on app load
export async function fetchCsrfToken() {
  try {
    await api.get('/csrf-token');
  } catch (e) {
    console.error('Failed to fetch CSRF token');
  }
}
