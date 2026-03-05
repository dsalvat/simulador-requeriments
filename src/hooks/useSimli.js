import { useState, useRef, useCallback } from "react";
import { SimliClient } from "simli-client";
import { apiFetch, reportUsage } from "../api";

export function useSimli() {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const clientRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const sessionStartRef = useRef(null);

  const initialize = useCallback(async (faceId) => {
    // Clean up any existing session
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
      setIsReady(false);
    }

    // Wait for refs to be attached to DOM elements
    const waitForRefs = () => new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        if (videoRef.current && audioRef.current) return resolve();
        if (++attempts > 50) return reject(new Error('Simli: videoRef/audioRef not available'));
        setTimeout(check, 100);
      };
      check();
    });
    await waitForRefs();

    // 1. Get session token from server
    const res = await apiFetch('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'simli', faceId })
    });
    if (!res.ok) throw new Error(`Simli token failed: ${res.status}`);
    const sessionData = await res.json();

    // 2. Create and configure SimliClient with session_token (not apiKey)
    const client = new SimliClient();
    client.Initialize({
      apiKey: '',
      session_token: sessionData.session_token,
      faceID: faceId,
      handleSilence: true,
      maxSessionLength: 3600,
      maxIdleTime: 300,
      videoRef: videoRef.current,
      audioRef: audioRef.current
    });

    // 3. Start the WebRTC connection
    await client.start();
    clientRef.current = client;
    sessionStartRef.current = Date.now();
    setIsReady(true);
  }, []);

  const cleanup = useCallback(() => {
    // Report Simli usage
    if (sessionStartRef.current) {
      const durationSeconds = (Date.now() - sessionStartRef.current) / 1000;
      reportUsage('simli', { durationSeconds, cost: (durationSeconds / 60) * 0.01 });
      sessionStartRef.current = null;
    }

    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
    setIsReady(false);
  }, []);

  return { videoRef, audioRef, clientRef, isReady, initialize, cleanup };
}
