import { useState, useEffect, useCallback } from "react";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) { setAuthLoading(false); return; }

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setUser(data.user))
      .catch(() => localStorage.removeItem('auth_token'))
      .finally(() => setAuthLoading(false));
  }, []);

  const loginWithGoogle = useCallback(async (googleToken) => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: googleToken }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error);
        return false;
      }

      localStorage.setItem('auth_token', data.token);
      setUser(data.user);
      return true;
    } catch {
      setAuthError('network_error');
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setUser(null);
    setAuthError(null);
  }, []);

  return { user, authLoading, authError, loginWithGoogle, logout };
}
