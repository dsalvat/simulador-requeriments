import { useState, useRef, useEffect, useCallback } from "react";
import { PERSONAS, CHECKLIST, PHASE_NAMES, PHASE_COLORS } from "./data";
import { callClaude, checkServicesStatus } from "./api";
import Avatar from "./components/Avatar";
import SimliAvatar from "./components/SimliAvatar";
import MiniChecklist from "./components/MiniChecklist";
import AchievementToast from "./components/AchievementToast";
import LoginScreen from "./components/LoginScreen";
import AdminPanel from "./components/AdminPanel";
import UserMenu from "./components/UserMenu";
import { useAuth } from "./hooks/useAuth";
import { useSession } from "./hooks/useSession";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { useDeepgram } from "./hooks/useDeepgram";
import { useElevenLabs } from "./hooks/useElevenLabs";
import { useSimli } from "./hooks/useSimli";

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  const { user: authUser, authLoading, authError, loginWithGoogle, logout } = useAuth();
  const session = useSession(authUser);
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
  const [mode, setMode] = useState(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const [toasts, setToasts] = useState([]);
  const completedRef = useRef(new Set());
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
    const isEval = /\b(ya tengo|tengo toda|evalúa|evalua|he acabado|fin de la reunión|finaliz|acabemos|ya estoy)\b/i.test(userText);

    setMessages(prev => [...prev, { role: "user", text: userText }]);
    setLoading(true);

    if (isEval) {
      const evalSystem = `Eres evaluador experto en toma de requerimientos. Evalúa la transcripción contra la checklist:

${CHECKLIST.map(c => `- ${c.id} (Fase ${c.fase}): ${c.label}`).join("\n")}

Un elemento se considera completado SOLO si la información se ha obtenido claramente. Responde en castellano:

COMPLETADOS: [IDs separados por comas]

EVALUACIÓN:
[4-8 frases constructivas]

PUNTOS FUERTES:
[2-3 puntos]

ÁREAS DE MEJORA:
[2-3 áreas con consejos]`;

      const t = [...messages, { role: "user", text: userText }].map(m =>
        `${m.role === "user" ? "TÉCNICO" : "USUARIO"}: ${m.text}`
      ).join("\n");

      const reply = await callClaude([{ role: "user", content: `Transcripción:\n\n${t}` }], evalSystem);
      const match = reply.match(/COMPLETADOS:\s*([A-Z0-9,\s]+)/i);
      let nc = new Set();
      if (match) match[1].split(",").forEach(id => { const tr = id.trim(); if (CHECKLIST.find(c => c.id === tr)) nc.add(tr); });
      setCompleted(nc);
      setEvalScore(nc.size);
      const evalText = reply.replace(/COMPLETADOS:.*\n*/i, "").trim();
      setEvaluation(evalText);
      // Save final score to session DB
      if (session.activeSession) {
        session.saveScore(session.activeSession.id, currentPersona.id, nc.size, Array.from(nc), evalText);
      }
      setScreen("eval");
      setLoading(false);
      return;
    }

    const newApi = [...currentApiMessages, { role: "user", content: userText }];
    const reply = await callClaude(newApi, currentPersona.system + "\n\nResponde de forma natural. SIEMPRE en castellano.");
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

    // ── Background checklist classification (non-blocking) ──
    const allMsgs = [...messages, { role: "user", text: userText }, { role: "persona", text: reply }];
    const prevCompleted = completedRef.current;
    const transcript = allMsgs.map(m =>
      `${m.role === "user" ? "TÉCNICO" : "USUARIO"}: ${m.text}`
    ).join("\n");

    const classifySystem = `Analiza esta transcripción de toma de requerimientos. Indica SOLO los elementos que se han abordado claramente en la conversación:
${CHECKLIST.map(c => `- ${c.id}: ${c.label}`).join("\n")}

Responde ÚNICAMENTE con los IDs separados por comas (ejemplo: P01,P02,P05). Si ninguno se ha completado, responde: NINGUNO`;

    callClaude([{ role: "user", content: transcript }], classifySystem).then(classifyReply => {
      if (classifyReply.includes("NINGUNO")) return;
      const ids = classifyReply.match(/[A-Z]+\d+/g) || [];
      const newCompleted = new Set(prevCompleted);
      const newItems = [];
      ids.forEach(id => {
        const item = CHECKLIST.find(c => c.id === id);
        if (item && !prevCompleted.has(id)) {
          newCompleted.add(id);
          newItems.push(item);
        }
      });
      if (newItems.length > 0) {
        completedRef.current = newCompleted;
        setCompleted(newCompleted);
        setToasts(prev => [
          ...prev,
          ...newItems.map((item, i) => ({
            id: `${item.id}-${Date.now()}-${i}`,
            itemId: item.id,
            label: item.label,
            fase: item.fase,
          }))
        ]);
        // Save incremental score to session DB
        if (session.activeSession) {
          session.saveScore(session.activeSession.id, currentPersona.id, newCompleted.size, Array.from(newCompleted), null);
        }
      }
    });
  }, [messages, voiceMode, isSaas, fallbackTTS, elevenLabsTTS]);

  const dismissToast = useCallback((toastId) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  }, []);

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
    completedRef.current = new Set();
    setToasts([]);
    setScreen("chat");
    setLoading(true);

    if (isSaas) {
      try {
        await simli.initialize(p.faceId);
      } catch (err) {
        console.error('Simli init failed, falling back:', err);
        setMode('fallback');
      }
    }

    const init = [{ role: "user", content: "[Llegas a la sala de reuniones. El técnico de sistemas te ha invitado para recoger requerimientos. Saluda brevemente.]" }];
    const reply = await callClaude(init, p.system + "\n\nEMPIEZA saludando brevemente. NO des toda la info de golpe. SIEMPRE en castellano.");
    setApiMessages([...init, { role: "assistant", content: reply }]);
    setMessages([{ role: "persona", text: reply }]);
    setLoading(false);

    if (voiceMode) {
      if (isSaas) {
        // Don't check simli.isReady (React state, stale here) — clientRef is already set after await initialize()
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
    processResponse("Ya tengo toda la información, evalúame.", persona, apiMessages);
  }, [tts, stt, persona, apiMessages, processResponse]);

  // ── Auto-eval when session time runs out ──────────────────
  const autoEvalTriggered = useRef(false);
  useEffect(() => {
    if (session.timeLeft === 0 && screen === "chat" && !autoEvalTriggered.current) {
      autoEvalTriggered.current = true;
      triggerEval();
    }
    if (session.timeLeft > 0) autoEvalTriggered.current = false;
  }, [session.timeLeft, screen, triggerEval]);

  // ── Auto-eval when admin stops the session ────────────────
  useEffect(() => {
    if (session.sessionStopped) {
      session.clearSessionStopped();
      if (screen === "chat" && !autoEvalTriggered.current) {
        autoEvalTriggered.current = true;
        triggerEval();
      } else if (screen === "select") {
        // Force re-render to hide the banner (polling already updated activeSession)
      }
    }
  }, [session.sessionStopped, screen, triggerEval]);

  // ── Progress helpers ──────────────────────────────────────
  const totalItems = CHECKLIST.length;
  const doneItems = completed.size;
  const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // ========== LOADING ==========
  if (mode === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "3px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Cargando...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ========== AUTH LOADING ==========
  if (authLoading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg-primary)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "3px solid var(--border)", borderTopColor: "var(--accent)",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // ========== LOGIN SCREEN ==========
  if (!authUser) {
    return <LoginScreen onGoogleLogin={loginWithGoogle} authError={authError} />;
  }

  // ========== ADMIN SCREEN ==========
  if (screen === "admin") {
    return (
      <AdminPanel
        currentUser={authUser}
        onBack={() => setScreen("select")}
        onLogout={logout}
      />
    );
  }

  // ========== SELECT SCREEN ==========
  if (screen === "select") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-primary)", position: "relative", overflow: "hidden" }}>
        {/* Decorative circle */}
        <div style={{
          position: "absolute", top: -120, right: -120, width: 400, height: 400,
          borderRadius: "50%", background: "var(--accent-subtle)", opacity: 0.7, pointerEvents: "none"
        }} />
        <div style={{
          position: "absolute", bottom: -80, left: -80, width: 250, height: 250,
          borderRadius: "50%", background: "var(--accent-subtle)", opacity: 0.4, pointerEvents: "none"
        }} />

        <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px", position: "relative" }}>
          {/* User menu */}
          <div style={{ position: "absolute", top: 16, right: 24, zIndex: 10 }}>
            <UserMenu
              user={authUser}
              onAdmin={() => setScreen("admin")}
              onLogout={logout}
            />
          </div>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 48, animation: "fadeSlideUp 0.6s ease-out" }}>
            <h1 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 40, fontWeight: 400,
              color: "var(--text-primary)", margin: "0 0 8px", letterSpacing: "-0.02em"
            }}>
              Simulador
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 16, margin: "0 0 16px", maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
              Practica la toma de requerimientos con personajes realistas
            </p>
            <div style={{ width: 48, height: 3, background: "var(--accent)", borderRadius: 2, margin: "0 auto 24px" }} />

            {/* Voice/Text toggle */}
            <div style={{
              display: "inline-flex", gap: 4, background: "var(--bg-secondary)", borderRadius: 10, padding: 4
            }}>
              <button onClick={() => setVoiceMode(true)} style={{
                padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: voiceMode ? "var(--accent)" : "transparent",
                color: voiceMode ? "var(--text-inverse)" : "var(--text-secondary)",
                transition: "all 0.2s"
              }}>Voz</button>
              <button onClick={() => setVoiceMode(false)} style={{
                padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
                background: !voiceMode ? "var(--accent)" : "transparent",
                color: !voiceMode ? "var(--text-inverse)" : "var(--text-secondary)",
                transition: "all 0.2s"
              }}>Texto</button>
            </div>
            {voiceMode && !stt.supported && (
              <div style={{ marginTop: 10, color: "var(--danger)", fontSize: 12 }}>Tu navegador no soporta reconocimiento de voz. Usa Chrome.</div>
            )}
            <div style={{ marginTop: 10, fontSize: 12, color: isSaas ? "var(--success)" : "var(--warning)" }}>
              {isSaas ? "Simli + ElevenLabs + Deepgram" : "Modo local (Web Speech API + SVG)"}
            </div>
          </div>

          {/* Session banner */}
          {session.sessionActive && (
            <div style={{
              background: "linear-gradient(135deg, var(--accent) 0%, #a0472e 100%)",
              borderRadius: 16, padding: "28px 32px", marginBottom: 32,
              color: "#fff", textAlign: "center",
              boxShadow: "0 8px 32px rgba(196,93,62,0.3)",
              animation: "fadeSlideUp 0.5s ease-out",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.85, marginBottom: 8 }}>
                Sesi&oacute;n Activa
              </div>
              <div style={{
                fontFamily: "'DM Serif Display', serif", fontSize: 48, fontWeight: 400,
                fontVariantNumeric: "tabular-nums", marginBottom: 8,
              }}>
                {Math.floor(session.timeLeft / 60)}:{String(session.timeLeft % 60).padStart(2, '0')}
              </div>
              <p style={{ fontSize: 14, opacity: 0.9, margin: "0 0 20px" }}>
                Se te asignar&aacute; un personaje aleatorio. &iexcl;Consigue el m&aacute;ximo de puntos!
              </p>
              <button onClick={() => {
                const available = PERSONAS.slice(0, 5);
                const random = available[Math.floor(Math.random() * available.length)];
                startSession(random);
              }} style={{
                background: "#fff", color: "var(--accent)", border: "none",
                padding: "14px 40px", borderRadius: 12, fontSize: 16, fontWeight: 700,
                cursor: "pointer", transition: "transform 0.2s",
              }}
                onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
              >
                Unirse a la Sesi&oacute;n
              </button>
            </div>
          )}

          {/* Persona cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16 }}>
            {PERSONAS.map((p, idx) => (
              <button key={p.id} onClick={() => startSession(p)} style={{
                background: "var(--bg-surface)", border: "none", borderRadius: 14,
                padding: "20px 16px 16px", cursor: "pointer", textAlign: "center",
                borderTop: `4px solid ${p.color}`,
                boxShadow: "var(--shadow-sm)",
                transition: "all 0.25s ease",
                animation: `fadeSlideUp 0.5s ease-out ${idx * 0.08}s both`
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow-lg)"; e.currentTarget.style.transform = "translateY(-4px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; e.currentTarget.style.transform = "none"; }}
              >
                <img src={p.previewImg} alt={p.name} style={{
                  width: 90, height: 90, borderRadius: "50%", objectFit: "cover",
                  border: `3px solid ${p.color}20`, margin: "0 auto"
                }} />
                <div style={{
                  fontFamily: "'DM Serif Display', serif", fontWeight: 400, fontSize: 18,
                  color: "var(--text-primary)", marginTop: 10
                }}>{p.name}</div>
                <div style={{ fontSize: 12, color: p.color, fontWeight: 600, marginBottom: 4 }}>{p.role}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{p.description}</div>
                <span style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, letterSpacing: "0.03em",
                  background: p.difficulty === "Fácil" ? "var(--success-bg)" : p.difficulty === "Difícil" ? "var(--danger-bg)" : "var(--warning-bg)",
                  color: p.difficulty === "Fácil" ? "var(--success)" : p.difficulty === "Difícil" ? "var(--danger)" : "var(--warning)"
                }}>{p.difficulty}</span>
              </button>
            ))}
          </div>

          {/* How it works */}
          <div style={{
            marginTop: 40, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20,
            animation: "fadeSlideUp 0.6s ease-out 0.5s both"
          }}>
            {[
              { num: "1", title: "Selecciona", desc: "Elige un avatar con el nivel de dificultad que quieras" },
              { num: "2", title: "Conversa", desc: "Haz de técnico y extrae toda la información siguiendo el guion" },
              { num: "3", title: "Evalúa", desc: "Di \"ya tengo toda la información\" para recibir la evaluación" }
            ].map(step => (
              <div key={step.num} style={{ textAlign: "center", padding: "20px 12px" }}>
                <div style={{
                  fontFamily: "'DM Serif Display', serif", fontSize: 32, color: "var(--accent-light)",
                  marginBottom: 8, lineHeight: 1
                }}>{step.num}</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-primary)", marginBottom: 4 }}>{step.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ========== EVAL SCREEN ==========
  if (screen === "eval") {
    const pct = Math.round((evalScore / CHECKLIST.length) * 100);
    const scoreColor = pct >= 70 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";

    // Parse evaluation into sections
    const sections = [];
    const evalText = evaluation;
    const puntsFortsMatch = evalText.match(/PUNTOS FUERTES:([\s\S]*?)(?=ÁREAS DE MEJORA:|$)/i);
    const areesMilloraMatch = evalText.match(/ÁREAS DE MEJORA:([\s\S]*?)$/i);
    const avaluacioMatch = evalText.match(/EVALUACIÓN:([\s\S]*?)(?=PUNTOS FUERTES:|$)/i);

    const avaluacioText = avaluacioMatch ? avaluacioMatch[1].trim() : evalText.split(/PUNTOS FUERTES:/i)[0].replace(/EVALUACIÓN:/i, "").trim();
    const puntsText = puntsFortsMatch ? puntsFortsMatch[1].trim() : "";
    const areesText = areesMilloraMatch ? areesMilloraMatch[1].trim() : "";

    // SVG gauge
    const radius = 80;
    const circumference = 2 * Math.PI * radius;
    const arcTarget = circumference - (pct / 100) * circumference;

    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-primary)", padding: "40px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Two-column layout */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "start" }}>
            {/* Left: evaluation text */}
            <div style={{ animation: "fadeSlideUp 0.5s ease-out 0.2s both" }}>
              <h2 style={{
                fontFamily: "'DM Serif Display', serif", fontSize: 28, fontWeight: 400,
                color: "var(--text-primary)", margin: "0 0 24px"
              }}>Debrief</h2>

              {/* General evaluation */}
              {avaluacioText && (
                <div style={{
                  background: "var(--bg-surface)", borderRadius: 12, padding: 24, marginBottom: 16,
                  border: "1px solid var(--border)", lineHeight: 1.7, fontSize: 14, whiteSpace: "pre-wrap",
                  color: "var(--text-primary)"
                }}>{avaluacioText}</div>
              )}

              {/* Punts Forts card */}
              {puntsText && (
                <div style={{
                  background: "var(--bg-surface)", borderRadius: 12, padding: 20, marginBottom: 16,
                  borderLeft: "4px solid var(--success)", animation: "fadeSlideUp 0.5s ease-out 0.4s both"
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--success)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Puntos Fuertes
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>{puntsText}</div>
                </div>
              )}

              {/* Àrees de Millora card */}
              {areesText && (
                <div style={{
                  background: "var(--bg-surface)", borderRadius: 12, padding: 20, marginBottom: 16,
                  borderLeft: "4px solid var(--warning)", animation: "fadeSlideUp 0.5s ease-out 0.6s both"
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--warning)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Áreas de Mejora
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>{areesText}</div>
                </div>
              )}
            </div>

            {/* Right: score + checklist */}
            <div>
              {/* Circular gauge */}
              <div style={{
                background: "var(--bg-surface)", borderRadius: 16, padding: 32,
                border: "1px solid var(--border)", textAlign: "center", marginBottom: 16,
                boxShadow: "var(--shadow-sm)", animation: "scaleIn 0.6s ease-out"
              }}>
                <svg width="180" height="180" viewBox="0 0 200 200" style={{ display: "block", margin: "0 auto" }}>
                  {/* Background circle */}
                  <circle cx="100" cy="100" r={radius} fill="none" stroke="var(--border)" strokeWidth="12" />
                  {/* Progress arc */}
                  <circle cx="100" cy="100" r={radius} fill="none" stroke={scoreColor} strokeWidth="12"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={arcTarget}
                    style={{
                      transform: "rotate(-90deg)", transformOrigin: "center",
                      animation: `arcDraw 1s ease-out forwards`,
                      "--arc-target": arcTarget
                    }}
                  />
                  {/* Score text */}
                  <text x="100" y="90" textAnchor="middle" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, fill: "var(--text-primary)" }}>
                    {pct}%
                  </text>
                  <text x="100" y="118" textAnchor="middle" style={{ fontSize: 13, fill: "var(--text-muted)" }}>
                    {evalScore}/{CHECKLIST.length} puntos
                  </text>
                </svg>
              </div>

              {/* Checklist */}
              <div style={{
                background: "var(--bg-surface)", borderRadius: 12, padding: 16,
                border: "1px solid var(--border)", animation: "fadeSlideUp 0.5s ease-out 0.4s both"
              }}>
                <MiniChecklist items={CHECKLIST} completed={completed} mode="detailed" />
              </div>

              {/* Buttons */}
              <div style={{ marginTop: 16, display: "flex", gap: 8, animation: "fadeSlideUp 0.5s ease-out 0.6s both" }}>
                <button onClick={() => setScreen("select")} style={{
                  flex: 1, background: "var(--accent)", color: "var(--text-inverse)", border: "none", borderRadius: 10,
                  padding: "12px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.2s"
                }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                >Volver</button>
                <button onClick={() => { setScreen("select"); }} style={{
                  padding: "12px 20px", background: "transparent", border: "1px solid var(--border)",
                  borderRadius: 10, fontSize: 14, color: "var(--text-secondary)", cursor: "pointer", transition: "all 0.2s"
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--accent)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}
                >Nuevo intento</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== CHAT SCREEN ==========
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-secondary)" }}>
      {/* Header — dark */}
      <div style={{
        background: "var(--bg-deep)", padding: "10px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Header shows preview image */}
          <img src={persona?.previewImg} alt={persona?.name} style={{
            width: 44, height: 44, borderRadius: "50%", objectFit: "cover",
            border: avatarState === "speaking" ? `2px solid ${persona?.color}` : "2px solid transparent",
            transition: "border-color 0.3s"
          }} />
          <div>
            <div style={{
              fontFamily: "'DM Serif Display', serif", color: "var(--text-inverse)",
              fontSize: 16, fontWeight: 400
            }}>{persona?.name}</div>
            <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{persona?.subtitle}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Session timer */}
          {session.sessionActive && session.timeLeft !== null && (
            <div style={{
              background: session.timeLeft < 60 ? "var(--danger)" : "var(--accent)",
              color: "#fff", padding: "5px 14px", borderRadius: 8,
              fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              animation: session.timeLeft < 60 ? "pulse 1s infinite" : "none",
            }}>
              {Math.floor(session.timeLeft / 60)}:{String(session.timeLeft % 60).padStart(2, '0')}
            </div>
          )}
          {/* Progress ring */}
          <button
            onClick={() => setShowChecklist(!showChecklist)}
            title="Ver progreso"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4, position: "relative" }}
          >
            <svg width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--accent-light)" strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 15}
                strokeDashoffset={2 * Math.PI * 15 * (1 - progressPct / 100)}
                style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 0.5s" }}
              />
              <text x="18" y="22" textAnchor="middle" style={{ fontSize: 10, fill: "var(--text-inverse)", fontWeight: 700 }}>
                {progressPct}
              </text>
            </svg>
          </button>
          <button onClick={triggerEval} style={{
            background: "var(--accent)", color: "var(--text-inverse)", border: "none", borderRadius: 8,
            padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "opacity 0.2s"
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={e => e.currentTarget.style.opacity = "1"}
          >Evaluar</button>
          <button onClick={exitSession} style={{
            background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8,
            padding: "7px 12px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer",
            transition: "background 0.2s"
          }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          >Salir</button>
        </div>
      </div>

      {/* Checklist overlay */}
      {showChecklist && (
        <div style={{
          position: "absolute", top: 68, right: 16, zIndex: 100,
          background: "var(--bg-surface)", borderRadius: 12, padding: 16, width: 280,
          boxShadow: "var(--shadow-xl)", border: "1px solid var(--border)",
          animation: "scaleIn 0.2s ease-out"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>Checklist</span>
            <button onClick={() => setShowChecklist(false)} style={{
              background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16
            }}>×</button>
          </div>
          <MiniChecklist items={CHECKLIST} completed={completed} mode="compact" />
        </div>
      )}

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
        {/* Achievement toasts */}
        <AchievementToast toasts={toasts} onDismiss={dismissToast} />

        {/* Avatar area — Simli video rendered ONCE here (always mounted so refs stay stable) */}
        {isSaas ? (
          <div style={{
            display: "flex", justifyContent: "center", padding: "16px 0 8px", flexShrink: 0,
            background: "linear-gradient(180deg, var(--bg-deep) 0%, var(--bg-secondary) 100%)"
          }}>
            <SimliAvatar
              videoRef={simli.videoRef}
              audioRef={simli.audioRef}
              persona={persona}
              avatarState={avatarState}
              size={180}
              hidden={!simli.isReady}
            />
            {!simli.isReady && <Avatar persona={persona} state={avatarState} size={160} />}
          </div>
        ) : (
          <div style={{
            display: "flex", justifyContent: "center", padding: "16px 0 8px", flexShrink: 0,
            background: "linear-gradient(180deg, var(--bg-deep) 0%, var(--bg-secondary) 100%)"
          }}>
            <Avatar persona={persona} state={avatarState} size={160} />
          </div>
        )}

        {/* Messages */}
        <div ref={chatRef} style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          <div style={{ maxWidth: 620, margin: "0 auto" }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 12, animation: "slideInMessage 0.3s ease-out"
              }}>
                <div style={{
                  maxWidth: "80%", padding: "12px 16px", fontSize: 14, lineHeight: 1.65,
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: m.role === "user" ? "var(--accent)" : "var(--bg-surface)",
                  color: m.role === "user" ? "var(--text-inverse)" : "var(--text-primary)",
                  borderLeft: m.role === "persona" ? `3px solid ${persona.color}` : "none",
                  boxShadow: "var(--shadow-sm)"
                }}>
                  {m.role === "persona" && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: persona.color, marginBottom: 4 }}>{persona.name}</div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", animation: "slideInMessage 0.3s ease-out" }}>
                <div style={{
                  background: "var(--bg-surface)", borderLeft: `3px solid ${persona?.color}`,
                  borderRadius: 16, padding: "12px 20px", boxShadow: "var(--shadow-sm)",
                  display: "flex", gap: 6, alignItems: "center"
                }}>
                  {[0, 1, 2].map(n => (
                    <span key={n} style={{
                      width: 7, height: 7, borderRadius: "50%", background: "var(--text-muted)",
                      display: "inline-block", animation: `dotPulse 1.2s infinite ${n * 0.15}s`
                    }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div style={{ background: "var(--bg-surface)", borderTop: "1px solid var(--border)", padding: "12px 16px", flexShrink: 0 }}>
          {stt.isListening && stt.transcript && (
            <div style={{
              maxWidth: 620, margin: "0 auto 8px", padding: "10px 14px",
              background: "var(--success-bg)", borderRadius: 10, fontSize: 13,
              color: "var(--text-primary)", fontStyle: "italic", borderLeft: "3px solid var(--success)"
            }}>
              {stt.transcript}
            </div>
          )}
          <div style={{ maxWidth: 620, margin: "0 auto", display: "flex", gap: 8, alignItems: "center" }}>
            {voiceMode ? (
              <>
                <button onClick={handleVoiceSend} disabled={loading} style={{
                  width: 56, height: 56, borderRadius: "50%", border: "none", fontSize: 22,
                  cursor: loading ? "default" : "pointer", flexShrink: 0,
                  background: stt.isListening ? "var(--danger)" : "var(--accent)",
                  color: "var(--text-inverse)",
                  transition: "all 0.2s",
                  animation: stt.isListening ? "pulse 1.5s infinite" : "none",
                  boxShadow: stt.isListening ? "none" : "var(--shadow-md)"
                }}>
                  {stt.isListening ? "⏹" : "🎤"}
                </button>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: stt.isListening ? "var(--danger)" : "var(--text-secondary)", fontWeight: 500 }}>
                    {stt.isListening ? "Escuchando... pulsa para enviar" : loading ? "Procesando..." : "Pulsa para hablar"}
                  </div>
                </div>
                {tts.isSpeaking && (
                  <button onClick={() => tts.stop()} style={{
                    width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--border)",
                    background: "var(--bg-surface)", cursor: "pointer", fontSize: 16
                  }}>🔇</button>
                )}
                <button onClick={() => setVoiceMode(false)} title="Cambiar a texto" style={{
                  width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--border)",
                  background: "var(--bg-surface)", cursor: "pointer", fontSize: 16
                }}>⌨️</button>
              </>
            ) : (
              <>
                <input type="text" value={textInput} onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && textInput.trim()) { handleSend(textInput); setTextInput(""); } }}
                  placeholder="Escribe tu pregunta..." disabled={loading}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)",
                    fontSize: 14, outline: "none", background: "var(--bg-primary)",
                    color: "var(--text-primary)", transition: "border-color 0.2s"
                  }}
                  onFocus={e => e.target.style.borderColor = "var(--accent)"}
                  onBlur={e => e.target.style.borderColor = "var(--border)"}
                />
                <button onClick={() => { if (textInput.trim()) { handleSend(textInput); setTextInput(""); } }}
                  disabled={loading || !textInput.trim()}
                  style={{
                    padding: "12px 20px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
                    background: loading || !textInput.trim() ? "var(--border)" : "var(--accent)",
                    color: loading || !textInput.trim() ? "var(--text-muted)" : "var(--text-inverse)",
                    transition: "all 0.2s"
                  }}>Enviar</button>
                <button onClick={() => setVoiceMode(true)} title="Cambiar a voz" style={{
                  width: 40, height: 40, borderRadius: "50%", border: "1px solid var(--border)",
                  background: "var(--bg-surface)", cursor: "pointer", fontSize: 16
                }}>🎤</button>
              </>
            )}
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            Di "ya tengo toda la información" para evaluar
          </div>
        </div>
      </div>
    </div>
  );
}
