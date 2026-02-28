import { useState, useRef, useCallback } from "react";

export function useElevenLabs(simliClientRef) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const abortControllerRef = useRef(null);

  const speak = useCallback(async (text, voiceId, onEnd) => {
    if (!text || !voiceId) return;
    setIsSpeaking(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId }),
        signal: abortController.signal
      });

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abortController.signal.aborted) break;
        // PCM16 chunks → pipe directly to Simli
        if (simliClientRef?.current) {
          simliClientRef.current.sendAudioData(value);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') console.error('ElevenLabs TTS error:', err);
    }

    setIsSpeaking(false);
    onEnd?.();
  }, [simliClientRef]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    if (simliClientRef?.current) {
      simliClientRef.current.ClearBuffer();
    }
    setIsSpeaking(false);
  }, [simliClientRef]);

  return { isSpeaking, speak, stop };
}
