import { useState, useRef, useEffect, useCallback } from "react";
import { PERSONAS, CHECKLIST } from "./data";
import { callClaude, checkServicesStatus } from "./api";
import Avatar from "./components/Avatar";
import SimliAvatar from "./components/SimliAvatar";
import MiniChecklist from "./components/MiniChecklist";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { useDeepgram } from "./hooks/useDeepgram";
import { useElevenLabs } from "./hooks/useElevenLabs";
import { useSimli } from "./hooks/useSimli";

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  const [screen, setScreen] = useState("select");
  const [persona, setPersona] = useState(null);
  const [messages, setMessages] = useState([]);
  const [apiMessages, setApiMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [avatarState, setAvatarState] = useState("idle");
  const [completed, setCompleted] = useState(new Set());
  const [evaluation, setEvaluation] = useState("");
  const [evalScore, setEvalScore] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [voiceMode, setVoiceMode] = useState(true);
  const [mode, setMode] = useState(null); // null = loading, 'saas' | 'fallback'
  const chatRef = useRef(null);

  // ── Service mode detection ─────────────────────────────────
  useEffect(() => {
    checkServicesStatus().then(s => {
      setMode(s.saasReady ? 'saas' : 'fallback');
    });
  }, []);

  // ── Hooks: fallback ────────────────────────────────────────
  const fallbackSTT = useSpeechRecognition();
  const fallbackTTS = useSpeechSynthesis();

  // ── Hooks: SaaS ────────────────────────────────────────────
  const simli = useSimli();
  const deepgramSTT = useDeepgram();
  const elevenLabsTTS = useElevenLabs(simli.clientRef);

  // ── Active STT/TTS based on mode ──────────────────────────
  const isSaas = mode === 'saas';
  const stt = isSaas ? deepgramSTT : fallbackSTT;
  const tts = isSaas ? elevenLabsTTS : fallbackTTS;

  // ── Voices / avatar state ─────────────────────────────────
  useEffect(() => { window.speechSynthesis?.getVoices(); }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (tts.isSpeaking) setAvatarState("speaking");
    else if (stt.isListening) setAvatarState("listening");
    else if (loading) setAvatarState("thinking");
    else setAvatarState("idle");
  }, [tts.isSpeaking, stt.isListening, loading]);

  // ── Core logic ─────────────────────────────────────────────

  const processResponse = useCallback(async (userText, currentPersona, currentApiMessages) => {
    const isEval = /\b(ja tinc|tinc tota|avalua|he acabat|fi de la reunió|finalitz|acabem|ja estic)\b/i.test(userText);

    setMessages(prev => [...prev, { role: "user", text: userText }]);
    setLoading(true);

    if (isEval) {
      const evalSystem = `Ets avaluador expert en presa de requeriments. Avalua la transcripció contra la checklist:

${CHECKLIST.map(c => `- ${c.id} (Fase ${c.fase}): ${c.label}`).join("\n")}

Un element es considera completat NOMÉS si la informació s'ha obtingut clarament. Respon en català:

COMPLETATS: [IDs separats per comes]

AVALUACIÓ:
[4-8 frases constructives]

PUNTS FORTS:
[2-3 punts]

ÀREES DE MILLORA:
[2-3 àrees amb consells]`;

      const t = [...messages, { role: "user", text: userText }].map(m =>
        `${m.role === "user" ? "TÈCNIC" : "USUARI"}: ${m.text}`
      ).join("\n");

      const reply = await callClaude([{ role: "user", content: `Transcripció:\n\n${t}` }], evalSystem);
      const match = reply.match(/COMPLETATS:\s*([A-Z0-9,\s]+)/i);
      let nc = new Set();
      if (match) match[1].split(",").forEach(id => { const tr = id.trim(); if (CHECKLIST.find(c => c.id === tr)) nc.add(tr); });
      setCompleted(nc);
      setEvalScore(nc.size);
      setEvaluation(reply.replace(/COMPLETATS:.*\n*/i, "").trim());
      setScreen("eval");
      setLoading(false);
      return;
    }

    const newApi = [...currentApiMessages, { role: "user", content: userText }];
    const reply = await callClaude(newApi, currentPersona.system + "\n\nRespon de forma natural. SEMPRE en català.");
    const updatedApi = [...newApi, { role: "assistant", content: reply }];

    setApiMessages(updatedApi);
    setMessages(prev => [...prev, { role: "persona", text: reply }]);
    setLoading(false);

    if (voiceMode) {
      if (isSaas) {
        elevenLabsTTS.speak(reply, currentPersona.voiceId);
      } else {
        fallbackTTS.speak(reply);
      }
    }
  }, [messages, voiceMode, isSaas, fallbackTTS, elevenLabsTTS]);

  const handleSend = useCallback((text) => {
    if (!text?.trim() || loading) return;
    processResponse(text.trim(), persona, apiMessages);
  }, [loading, persona, apiMessages, processResponse]);

  const handleVoiceSend = useCallback(() => {
    if (stt.isListening) {
      stt.stopListening();
      setTimeout(() => {
        if (stt.transcript.trim()) {
          handleSend(stt.transcript.trim());
          stt.setTranscript("");
        }
      }, 300);
    } else {
      tts.stop();
      stt.startListening();
    }
  }, [stt, tts, handleSend]);

  const startSession = useCallback(async (p) => {
    setPersona(p);
    setMessages([]);
    setApiMessages([]);
    setCompleted(new Set());
    setScreen("chat");
    setLoading(true);

    // Initialize Simli if SaaS mode
    if (isSaas) {
      try {
        await simli.initialize(p.faceId);
      } catch (err) {
        console.error('Simli init failed, falling back:', err);
        setMode('fallback');
      }
    }

    const init = [{ role: "user", content: "[Arribes a la sala de reunions. El tècnic de sistemes t'ha convidat per recollir requeriments. Saluda breument.]" }];
    const reply = await callClaude(init, p.system + "\n\nCOMENÇA saludant breument. NO donis tota la info de cop. SEMPRE en català.");
    setApiMessages([...init, { role: "assistant", content: reply }]);
    setMessages([{ role: "persona", text: reply }]);
    setLoading(false);

    if (voiceMode) {
      if (isSaas && simli.isReady) {
        elevenLabsTTS.speak(reply, p.voiceId);
      } else {
        fallbackTTS.speak(reply);
      }
    }
  }, [voiceMode, isSaas, fallbackTTS, elevenLabsTTS, simli]);

  const exitSession = useCallback(() => {
    tts.stop();
    if (stt.isListening) stt.stopListening();
    if (isSaas) simli.cleanup();
    setScreen("select");
  }, [tts, stt, isSaas, simli]);

  const triggerEval = useCallback(() => {
    tts.stop();
    if (stt.isListening) stt.stopListening();
    processResponse("Ja tinc tota la informació, avalua'm.", persona, apiMessages);
  }, [tts, stt, persona, apiMessages, processResponse]);

  // ========== LOADING ==========
  if (mode === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", color: "#666" }}>Carregant...</div>
      </div>
    );
  }

  // ========== SELECT SCREEN ==========
  if (screen === "select") {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f5f7fa 0%, #e4e9f0 100%)", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "30px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>🎭</div>
            <h1 style={{ color: "#1B3A5C", fontSize: 24, margin: "0 0 6px", fontWeight: 800 }}>Simulador de Presa de Requeriments</h1>
            <p style={{ color: "#666", fontSize: 14, margin: "0 0 16px" }}>Practica amb veu el guió de requeriments. Selecciona un avatar.</p>
            <div style={{ display: "inline-flex", gap: 8, background: "#fff", borderRadius: 8, padding: 4, border: "1px solid #ddd" }}>
              <button onClick={() => setVoiceMode(true)} style={{
                padding: "6px 16px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: voiceMode ? "#1B3A5C" : "transparent", color: voiceMode ? "#fff" : "#666"
              }}>🎤 Veu</button>
              <button onClick={() => setVoiceMode(false)} style={{
                padding: "6px 16px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: !voiceMode ? "#1B3A5C" : "transparent", color: !voiceMode ? "#fff" : "#666"
              }}>⌨️ Text</button>
            </div>
            {voiceMode && !stt.supported && (
              <div style={{ marginTop: 8, color: "#C0392B", fontSize: 12 }}>⚠️ El teu navegador no suporta reconeixement de veu. Usa Chrome.</div>
            )}
            <div style={{ marginTop: 8, fontSize: 11, color: isSaas ? "#27AE60" : "#E67E22" }}>
              {isSaas ? "Simli + ElevenLabs + Deepgram actius" : "Mode local (Web Speech API + SVG avatars)"}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
            {PERSONAS.map(p => (
              <button key={p.id} onClick={() => startSession(p)} style={{
                background: "#fff", border: "2px solid #e8e8e8", borderRadius: 16, padding: 16, cursor: "pointer",
                textAlign: "center", transition: "all 0.2s"
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = p.color; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e8e8e8"; e.currentTarget.style.transform = "none"; }}
              >
                <Avatar persona={p} state="idle" size={100} />
                <div style={{ fontWeight: 700, fontSize: 14, color: p.color, marginTop: 8 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>{p.subtitle}</div>
                <span style={{
                  padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 600,
                  background: p.difficulty === "Fàcil" ? "#E8F5E9" : p.difficulty === "Difícil" ? "#FFEBEE" : "#FFF3E0",
                  color: p.difficulty === "Fàcil" ? "#2D7D46" : p.difficulty === "Difícil" ? "#C0392B" : "#E67E22"
                }}>{p.difficulty}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 20, background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e0e0e0" }}>
            <h3 style={{ color: "#1B3A5C", margin: "0 0 6px", fontSize: 13 }}>Com funciona</h3>
            <p style={{ color: "#666", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
              Tu fas de <strong>tècnic</strong>. Segueix el guió de presa de requeriments i extreu tota la informació.
              Prem 🎤 per parlar o ⌨️ per escriure. Quan acabis, digues <strong>"ja tinc tota la informació"</strong> per rebre l'avaluació.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ========== EVAL SCREEN ==========
  if (screen === "eval") {
    const pct = Math.round((evalScore / CHECKLIST.length) * 100);
    return (
      <div style={{ minHeight: "100vh", background: "#f5f7fa", fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 20 }}>
        <div style={{ maxWidth: 650, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 50 }}>{pct >= 70 ? "🎯" : pct >= 50 ? "📋" : "⚠️"}</div>
            <h2 style={{ color: "#1B3A5C", margin: "8px 0" }}>Avaluació</h2>
            <div style={{
              display: "inline-block", padding: "8px 24px", borderRadius: 20, fontSize: 20, fontWeight: 700,
              background: (pct >= 70 ? "#27AE60" : pct >= 50 ? "#E67E22" : "#C0392B") + "18",
              color: pct >= 70 ? "#27AE60" : pct >= 50 ? "#E67E22" : "#C0392B"
            }}>
              {evalScore}/{CHECKLIST.length} ({pct}%)
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, lineHeight: 1.7, whiteSpace: "pre-wrap", fontSize: 14, marginBottom: 16, border: "1px solid #e0e0e0" }}>{evaluation}</div>
          <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 20, border: "1px solid #e0e0e0" }}>
            <MiniChecklist items={CHECKLIST} completed={completed} />
          </div>
          <div style={{ textAlign: "center" }}>
            <button onClick={() => setScreen("select")} style={{
              background: "#1B3A5C", color: "#fff", border: "none", borderRadius: 8,
              padding: "12px 30px", fontSize: 15, fontWeight: 600, cursor: "pointer"
            }}>Tornar a començar</button>
          </div>
        </div>
      </div>
    );
  }

  // ========== CHAT SCREEN ==========
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#f0f2f5" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e0e0e0", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{persona?.emoji}</span>
          <span style={{ fontWeight: 700, color: persona?.color, fontSize: 14 }}>{persona?.name}</span>
          <span style={{ color: "#999", fontSize: 12 }}>{persona?.subtitle}</span>
          {isSaas && <span style={{ fontSize: 9, color: "#27AE60", background: "#E8F5E9", padding: "1px 6px", borderRadius: 8 }}>SaaS</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={triggerEval} style={{ background: "#E67E22", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            📊 Avaluar
          </button>
          <button onClick={exitSession} style={{
            background: "#eee", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 11, color: "#666", cursor: "pointer"
          }}>✕ Sortir</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Avatar + checklist */}
        <div style={{ width: 260, background: "#fff", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column", alignItems: "center", padding: 16, flexShrink: 0, overflow: "hidden" }}>
          {isSaas && simli.isReady ? (
            <SimliAvatar
              videoRef={simli.videoRef}
              audioRef={simli.audioRef}
              persona={persona}
              avatarState={avatarState}
              size={180}
            />
          ) : (
            <Avatar persona={persona} state={avatarState} size={180} />
          )}
          <div style={{ marginTop: 16, width: "100%", flex: 1, overflow: "auto" }}>
            <MiniChecklist items={CHECKLIST} completed={completed} />
          </div>
        </div>

        {/* Chat */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div ref={chatRef} style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                  <div style={{
                    maxWidth: "82%", padding: "10px 14px", fontSize: 13.5, lineHeight: 1.6,
                    borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: m.role === "user" ? "#1B3A5C" : "#fff",
                    color: m.role === "user" ? "#fff" : "#333",
                    border: m.role === "user" ? "none" : "1px solid #e8e8e8",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.06)"
                  }}>
                    {m.role === "persona" && <div style={{ fontSize: 10, fontWeight: 600, color: persona.color, marginBottom: 3 }}>{persona.name}</div>}
                    {m.text}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: "flex" }}>
                  <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 14, padding: "10px 18px", fontSize: 13, color: "#999" }}>
                    Pensant...
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div style={{ background: "#fff", borderTop: "1px solid #e0e0e0", padding: 12, flexShrink: 0 }}>
            {stt.isListening && stt.transcript && (
              <div style={{ maxWidth: 600, margin: "0 auto 8px", padding: "8px 12px", background: "#E8F5E9", borderRadius: 8, fontSize: 13, color: "#333", fontStyle: "italic" }}>
                🎤 {stt.transcript}
              </div>
            )}
            <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", gap: 8, alignItems: "center" }}>
              {voiceMode ? (
                <>
                  <button onClick={handleVoiceSend} disabled={loading} style={{
                    flex: 1, padding: "14px 20px", borderRadius: 12, border: "none", fontSize: 15, fontWeight: 600,
                    cursor: loading ? "default" : "pointer",
                    background: stt.isListening ? "#EF5350" : "#27AE60", color: "#fff",
                    transition: "all 0.2s", animation: stt.isListening ? "pulse 1.5s infinite" : "none"
                  }}>
                    {stt.isListening ? "⏹️ Parar i enviar" : "🎤 Prem per parlar"}
                  </button>
                  {tts.isSpeaking && (
                    <button onClick={() => tts.stop()} style={{ padding: "14px 16px", borderRadius: 12, border: "none", background: "#eee", cursor: "pointer", fontSize: 14 }}>🔇</button>
                  )}
                  <button onClick={() => setVoiceMode(false)} title="Canviar a text" style={{ padding: "14px 16px", borderRadius: 12, border: "none", background: "#f5f5f5", cursor: "pointer", fontSize: 14 }}>⌨️</button>
                </>
              ) : (
                <>
                  <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && textInput.trim()) { handleSend(textInput); setTextInput(""); } }}
                    placeholder="Escriu la teva pregunta..." disabled={loading}
                    style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14, outline: "none" }}
                  />
                  <button onClick={() => { if (textInput.trim()) { handleSend(textInput); setTextInput(""); } }}
                    disabled={loading || !textInput.trim()}
                    style={{
                      padding: "12px 18px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
                      background: loading || !textInput.trim() ? "#ccc" : "#1B3A5C", color: "#fff"
                    }}>Enviar</button>
                  <button onClick={() => setVoiceMode(true)} title="Canviar a veu" style={{ padding: "12px 16px", borderRadius: 10, border: "none", background: "#f5f5f5", cursor: "pointer", fontSize: 14 }}>🎤</button>
                </>
              )}
            </div>
            <div style={{ textAlign: "center", fontSize: 10, color: "#bbb", marginTop: 6 }}>
              {voiceMode ? "Prem per gravar, torna a prémer per enviar." : "Escriu i prem Enter."} Digues "ja tinc tota la informació" per avaluar.
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,83,80,0.4); }
          50% { box-shadow: 0 0 0 12px rgba(239,83,80,0); }
        }
      `}</style>
    </div>
  );
}
