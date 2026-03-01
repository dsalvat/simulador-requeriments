import { useState, useEffect, useCallback, useRef } from "react";

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

export function useSession(user) {
  const [activeSession, setActiveSession] = useState(null);
  const [participation, setParticipation] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [sessionStopped, setSessionStopped] = useState(false);
  const timerRef = useRef(null);
  const pollRef = useRef(null);
  const prevStatusRef = useRef(null);

  const checkActiveSession = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/sessions/active', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const prevStatus = prevStatusRef.current;
        const newStatus = data.session?.status || null;

        // Detect admin stop: was active, now finished or gone
        if (prevStatus === 'active' && (newStatus === 'finished' || !data.session)) {
          setSessionStopped(true);
        }
        prevStatusRef.current = newStatus;

        setActiveSession(data.session);
        setParticipation(data.participation);
      }
    } catch (e) { console.error('Session check error:', e); }
  }, [user]);

  // Initial check + polling every 10s
  useEffect(() => {
    checkActiveSession();
    pollRef.current = setInterval(checkActiveSession, 10000);
    return () => clearInterval(pollRef.current);
  }, [checkActiveSession]);

  // Allow resetting the stopped flag after consuming it
  const clearSessionStopped = useCallback(() => setSessionStopped(false), []);

  // Countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!activeSession || activeSession.status !== 'active' || !activeSession.started_at) {
      setTimeLeft(null);
      return;
    }
    const updateTimer = () => {
      const started = new Date(activeSession.started_at).getTime();
      const endTime = started + activeSession.duration_min * 60 * 1000;
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setActiveSession(prev => prev ? { ...prev, status: 'finished' } : null);
      }
    };
    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => clearInterval(timerRef.current);
  }, [activeSession]);

  const saveScore = useCallback(async (sessionId, personaId, score, completedItems, evaluation) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          persona_id: personaId,
          score,
          completed_items: completedItems,
          evaluation: evaluation || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setParticipation(data.participant);
        return data.participant;
      }
    } catch (e) { console.error('Save score error:', e); }
    return null;
  }, []);

  return {
    activeSession,
    participation,
    timeLeft,
    sessionActive: !!(activeSession && activeSession.status === 'active' && timeLeft > 0),
    sessionStopped,
    clearSessionStopped,
    saveScore,
    checkActiveSession,
  };
}
