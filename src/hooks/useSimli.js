import { useState, useRef, useCallback } from "react";
import { SimliClient } from "simli-client";

export function useSimli() {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const clientRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [avatarState, setAvatarState] = useState("idle");

  const initialize = useCallback(async (faceId) => {
    // Clean up any existing session
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }

    // 1. Get session token from server
    const res = await fetch('/api/simli-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ faceId })
    });
    if (!res.ok) throw new Error(`Simli token failed: ${res.status}`);
    const sessionData = await res.json();

    // 2. Create and configure SimliClient
    const client = new SimliClient();
    client.Initialize({
      apiKey: sessionData.session_token || sessionData.apiKey || '',
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
    setIsReady(true);
    setAvatarState("idle");
  }, []);

  const cleanup = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
    setIsReady(false);
    setAvatarState("idle");
  }, []);

  return { videoRef, audioRef, clientRef, isReady, avatarState, setAvatarState, initialize, cleanup };
}
