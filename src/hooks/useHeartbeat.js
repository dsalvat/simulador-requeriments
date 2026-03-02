import { useEffect, useRef } from "react";
import { sendHeartbeat } from "../api";
import { CLIENT_ID } from "../clientId";

export function useHeartbeat(screen, persona, mode) {
  const intervalRef = useRef(null);

  useEffect(() => {
    const state = {
      screen,
      personaId: persona?.id || null,
      personaName: persona?.name || null,
      mode: mode || null
    };

    // Send immediately
    sendHeartbeat(state);

    // Then every 15s
    intervalRef.current = setInterval(() => sendHeartbeat(state), 15000);

    // Cleanup on unmount or state change
    return () => clearInterval(intervalRef.current);
  }, [screen, persona?.id, mode]);

  // Notify on tab close
  useEffect(() => {
    const onUnload = () => {
      const url = '/api/heartbeat';
      const body = JSON.stringify({ screen: 'disconnected' });
      const token = localStorage.getItem('auth_token');
      const headers = { type: 'application/json' };
      // sendBeacon doesn't support custom headers, so use fetch with keepalive
      try {
        fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': CLIENT_ID,
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body,
          keepalive: true
        });
      } catch {}
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);
}
