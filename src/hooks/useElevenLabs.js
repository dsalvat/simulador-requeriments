import { useState, useRef, useCallback } from "react";
import { apiFetch } from "../api";

// Buffer size: 6400 bytes = 200ms of PCM16 @ 16kHz mono
const BUFFER_SIZE = 6400;

export function useElevenLabs(simliClientRef) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const abortControllerRef = useRef(null);

  const speak = useCallback(async (text, voiceId, onEnd) => {
    if (!text || !voiceId) return;
    setIsSpeaking(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await apiFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId }),
        signal: abortController.signal
      });

      if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

      const reader = response.body.getReader();
      let buffer = new Uint8Array(0);

      const flushBuffer = (force) => {
        while (buffer.length >= BUFFER_SIZE) {
          const chunk = buffer.slice(0, BUFFER_SIZE);
          buffer = buffer.slice(BUFFER_SIZE);
          if (simliClientRef?.current) {
            simliClientRef.current.sendAudioData(chunk);
          }
        }
        // Flush remaining bytes at end of stream
        if (force && buffer.length > 0) {
          if (simliClientRef?.current) {
            simliClientRef.current.sendAudioData(buffer);
          }
          buffer = new Uint8Array(0);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (abortController.signal.aborted) break;
        // Append incoming chunk to buffer
        const combined = new Uint8Array(buffer.length + value.length);
        combined.set(buffer);
        combined.set(value, buffer.length);
        buffer = combined;
        flushBuffer(false);
      }
      // Flush any remaining audio data
      flushBuffer(true);
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
