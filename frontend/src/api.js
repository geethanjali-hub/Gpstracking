/**
 * Enterprise API & Authentication Client with JWT, Refresh Tokens & OAuth 2.0
 */

export const API_BASE = import.meta.env?.VITE_API_BASE || (
  (typeof window !== 'undefined')
    ? (window.location.port === '3000' || window.location.hostname === 'localhost' ? 'http://localhost:3001' : 'https://gpstracking-gttn.onrender.com')
    : 'https://gpstracking-gttn.onrender.com'
);


// Token Storage Keys
const ACCESS_TOKEN_KEY = 'ibots_access_token';
const REFRESH_TOKEN_KEY = 'ibots_refresh_token';
const USER_KEY = 'ibots_user_profile';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || '';
}

export function getUserProfile() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

export function setSession(accessToken, refreshToken, user) {
  if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Authenticate with Username/Email & Password (JWT + Refresh Tokens)
 */
export async function login(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Login failed');
  }

  setSession(data.accessToken, data.refreshToken, data.user);
  return data;
}

/**
 * Authenticate with Google OAuth 2.0 Credentials
 */
export async function loginWithGoogle(email, name, googleId) {
  const res = await fetch(`${API_BASE}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, googleId })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Google OAuth failed');
  }

  setSession(data.accessToken, data.refreshToken, data.user);
  return data;
}

/**
 * Refresh Expired Access Token using Refresh Token (Token Rotation)
 */
export async function refreshAccessToken() {
  const rToken = getRefreshToken();
  if (!rToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rToken })
    });

    const data = await res.json();
    if (!res.ok) {
      clearSession();
      return false;
    }

    setSession(data.accessToken, data.refreshToken, data.user);
    return data.accessToken;
  } catch (err) {
    clearSession();
    return false;
  }
}

/**
 * Logout User & Revoke Tokens
 */
export async function logout() {
  const rToken = getRefreshToken();
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rToken })
    });
  } catch (err) {
    console.warn('Logout network error:', err.message);
  } finally {
    clearSession();
  }
}

/**
 * Authorized Fetch Wrapper with Automatic JWT Bearer Header & Silent Token Refresh
 */
export async function authFetch(url, options = {}) {
  let token = getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const reqUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  let response = await fetch(reqUrl, { ...options, headers });

  // Handle Token Expiry (401 Unauthorized) with Silent Automatic Refresh
  if (response.status === 401 && getRefreshToken()) {
    console.log('🔄 Access Token expired. Attempting silent refresh...');
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(reqUrl, { ...options, headers });
    }
  }

  return response;
}
