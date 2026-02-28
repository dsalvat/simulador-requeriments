import { useState, useRef, useCallback } from "react";

export function useDeepgram() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported] = useState(true);
  const wsRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const finalTranscriptRef = useRef("");

  const startListening = useCallback(async () => {
    setTranscript("");
    finalTranscriptRef.current = "";

    try {
      // 1. Get temporary token from server
      const tokenRes = await fetch('/api/deepgram-token', { method: 'POST' });
      if (!tokenRes.ok) throw new Error('Failed to get Deepgram token');
      const tokenData = await tokenRes.json();
      const token = tokenData.access_token || tokenData.key;

      // 2. Open WebSocket to Deepgram
      const ws = new WebSocket(
        `wss://api.deepgram.com/v1/listen?model=nova-3&language=ca&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000&channels=1&token=${token}`
      );
      wsRef.current = ws;

      ws.onopen = async () => {
        // 3. Capture microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true }
        });
        mediaStreamRef.current = stream;

        // 4. AudioContext to extract PCM16 chunks
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const float32 = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
              int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
            }
            ws.send(int16.buffer);
          }
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
        setIsListening(true);
      };

      // 5. Handle transcript messages
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const alt = data?.channel?.alternatives?.[0];
          if (!alt?.transcript) return;

          if (data.is_final) {
            finalTranscriptRef.current += alt.transcript + " ";
            setTranscript(finalTranscriptRef.current);
          } else {
            setTranscript(finalTranscriptRef.current + alt.transcript);
          }
        } catch {}
      };

      ws.onerror = () => setIsListening(false);
      ws.onclose = () => setIsListening(false);
    } catch (err) {
      console.error('Deepgram start error:', err);
      setIsListening(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    // Close WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
      wsRef.current.close();
    }
    wsRef.current = null;

    // Stop microphone
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;

    // Close audio context
    processorRef.current?.disconnect();
    processorRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;

    setIsListening(false);
  }, []);

  return { isListening, transcript, startListening, stopListening, supported, setTranscript };
}
