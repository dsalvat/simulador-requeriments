import { useState, useEffect, useCallback, useRef } from "react";
import { CHECKLIST, PHASE_NAMES, PHASE_COLORS } from "../data";

const CHECKLIST_TOTAL = CHECKLIST.length;

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  return `Hace ${Math.floor(hours / 24)}d`;
}

function formatCountdown(session) {
  if (!session || session.status !== 'active' || !session.started_at) return null;
  const end = new Date(session.started_at).getTime() + session.duration_min * 60000;
  const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return { text: `${m}:${String(s).padStart(2, '0')}`, seconds: left };
}

const STATUS_STYLES = {
  created: { bg: "#FFF3E0", color: "#E67E22", label: "Creada" },
  active: { bg: "#E8F5E9", color: "#2E7D32", label: "Activa" },
  finished: { bg: "#F3E5F5", color: "#7B1FA2", label: "Finalizada" },
};

function parseEvaluation(text) {
  if (!text) return null;
  const evalMatch = text.match(/EVALUACI[OÓ]N:\s*([\s\S]*?)(?=PUNTOS FUERTES:|$)/i);
  const strengthsMatch = text.match(/PUNTOS FUERTES:\s*([\s\S]*?)(?=[AÁ]REAS DE MEJORA:|$)/i);
  const improvementMatch = text.match(/[AÁ]REAS DE MEJORA:\s*([\s\S]*?)$/i);
  return {
    evaluation: evalMatch ? evalMatch[1].trim() : text.trim(),
    strengths: strengthsMatch ? strengthsMatch[1].trim() : "",
    improvements: improvementMatch ? improvementMatch[1].trim() : "",
  };
}

function groupByPhase(completedItems) {
  const groups = {};
  if (!completedItems) return groups;
  for (const itemId of completedItems) {
    const item = CHECKLIST.find(c => c.id === itemId);
    if (item) {
      if (!groups[item.fase]) groups[item.fase] = [];
      groups[item.fase].push(item);
    }
  }
  return groups;
}

export default function SessionManager() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(15);
  const [creating, setCreating] = useState(false);
  const [viewingId, setViewingId] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [rankingSession, setRankingSession] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const prevRankRef = useRef({});

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sessions', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const createSession = async () => {
    setCreating(true);
    try {
      await fetch('/api/admin/sessions', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ duration_min: duration }),
      });
      fetchSessions();
    } catch (e) { console.error(e); }
    setCreating(false);
  };

  const startSession = async (id) => {
    await fetch(`/api/admin/sessions/${id}`, {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ action: 'start' }),
    });
    fetchSessions();
    viewRanking(id);
  };

  const stopSession = async (id) => {
    await fetch(`/api/admin/sessions/${id}`, {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ action: 'stop' }),
    });
    fetchRanking(id);
    fetchSessions();
  };

  const fetchRanking = useCallback(async (id) => {
    try {
      const res = await fetch(`/api/admin/sessions/${id}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        // Track position changes
        const newPositions = {};
        data.ranking.forEach((r, i) => { newPositions[r.user_id] = i; });
        prevRankRef.current = newPositions;
        setRanking(data.ranking);
        setRankingSession(data.session);
      }
    } catch (e) { console.error(e); }
  }, []);

  const viewRanking = useCallback((id) => {
    setViewingId(id);
    prevRankRef.current = {};
    fetchRanking(id);
    // Start polling
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => fetchRanking(id), 30000);
  }, [fetchRanking]);

  // Countdown timer for active session being viewed
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!rankingSession || rankingSession.status !== 'active') {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const c = formatCountdown(rankingSession);
      setCountdown(c);
      if (c && c.seconds <= 0) {
        fetchRanking(rankingSession.id);
        fetchSessions();
      }
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => clearInterval(timerRef.current);
  }, [rankingSession, fetchRanking, fetchSessions]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const closeRanking = () => {
    setViewingId(null);
    setRanking([]);
    setRankingSession(null);
    setExpandedUserId(null);
    if (pollRef.current) clearInterval(pollRef.current);
    fetchSessions();
  };

  // ── Ranking View ──────────────────────────────────────────────
  if (viewingId) {
    const isActive = rankingSession?.status === 'active';
    const isLow = countdown && countdown.seconds < 60;

    return (
      <div>
        {/* Ranking header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 24,
        }}>
          <div>
            <h2 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 24,
              color: "var(--text-primary)", fontWeight: 400, margin: "0 0 4px",
            }}>
              {isActive ? "Ranking en Vivo" : "Resultados Finales"}
            </h2>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Sesi&oacute;n #{viewingId} &middot; {rankingSession?.duration_min} min
              &middot; {ranking.length} participante{ranking.length !== 1 ? "s" : ""}
              {isActive && " · Actualizando cada 30s"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {isActive && countdown && (
              <div style={{
                background: isLow ? "var(--danger)" : "var(--accent)",
                color: "#fff", padding: "8px 20px", borderRadius: 10,
                fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums",
                fontFamily: "'DM Sans', sans-serif",
                animation: isLow ? "pulse 1s infinite" : "none",
                minWidth: 80, textAlign: "center",
              }}>
                {countdown.text}
              </div>
            )}
            {isActive && (
              <button onClick={() => stopSession(viewingId)} style={{
                background: "var(--danger)", color: "#fff", border: "none",
                padding: "10px 20px", borderRadius: 10, cursor: "pointer",
                fontSize: 14, fontWeight: 500,
              }}>
                Detener Sesi&oacute;n
              </button>
            )}
            <button onClick={closeRanking} style={{
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--text-secondary)", padding: "10px 20px", borderRadius: 10,
              cursor: "pointer", fontSize: 14,
            }}>
              Volver
            </button>
          </div>
        </div>

        {/* Ranking table */}
        {ranking.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "60px 20px", color: "var(--text-muted)",
            background: "var(--bg-surface)", borderRadius: 16,
          }}>
            {isActive ? "Esperando participantes..." : "No hubo participantes en esta sesi\u00f3n"}
          </div>
        ) : (
          <div style={{
            background: "var(--bg-surface)", borderRadius: 16,
            boxShadow: "var(--shadow-sm)", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: "50px 1fr 120px 100px 80px",
              padding: "12px 20px", borderBottom: "1px solid var(--border)",
              fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              <span>#</span><span>Participante</span><span>Personaje</span>
              <span>Puntos</span><span>Progreso</span>
            </div>

            {/* Rows */}
            {ranking.map((r, i) => {
              const pct = Math.round((r.score / CHECKLIST_TOTAL) * 100);
              const pctColor = pct >= 70 ? "var(--success)" : pct >= 50 ? "var(--warning)" : "var(--danger)";
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
              const isExpanded = expandedUserId === r.user_id;
              const hasEval = !!r.evaluation;

              return (
                <div key={r.user_id}>
                  <div
                    onClick={() => hasEval && setExpandedUserId(isExpanded ? null : r.user_id)}
                    style={{
                      display: "grid", gridTemplateColumns: "50px 1fr 120px 100px 80px 30px",
                      padding: "14px 20px", borderBottom: isExpanded ? "none" : "1px solid var(--border)",
                      alignItems: "center",
                      transition: "all 0.3s ease",
                      background: isExpanded ? "var(--bg-secondary)" : i === 0 && r.score > 0 ? "rgba(255,215,0,0.04)" : "transparent",
                      cursor: hasEval ? "pointer" : "default",
                    }}
                    onMouseEnter={e => { if (hasEval) e.currentTarget.style.background = "var(--bg-secondary)"; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = i === 0 && r.score > 0 ? "rgba(255,215,0,0.04)" : "transparent"; }}
                  >
                    {/* Position */}
                    <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
                      {medal || (i + 1)}
                    </span>
                    {/* Name + avatar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {r.avatar_url ? (
                        <img src={r.avatar_url} alt="" style={{
                          width: 34, height: 34, borderRadius: "50%", objectFit: "cover",
                        }} />
                      ) : (
                        <div style={{
                          width: 34, height: 34, borderRadius: "50%", background: "var(--accent-subtle)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "var(--accent)", fontWeight: 600, fontSize: 14,
                        }}>
                          {(r.name || r.email || "?")[0].toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                          {r.name || r.email}
                        </div>
                        {r.finished_at && (
                          <div style={{ fontSize: 11, color: "var(--success)" }}>
                            Completado
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Persona */}
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {r.persona_id}
                    </span>
                    {/* Score */}
                    <span style={{
                      fontSize: 18, fontWeight: 700, color: pctColor,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {r.score}/{CHECKLIST_TOTAL}
                    </span>
                    {/* Progress bar */}
                    <div style={{ width: "100%" }}>
                      <div style={{
                        height: 8, borderRadius: 4, background: "var(--border)",
                        overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", borderRadius: 4, background: pctColor,
                          width: `${pct}%`, transition: "width 0.8s ease",
                        }} />
                      </div>
                      <div style={{
                        fontSize: 11, color: "var(--text-muted)", marginTop: 2,
                        textAlign: "center",
                      }}>
                        {pct}%
                      </div>
                    </div>
                    {/* Chevron */}
                    <span style={{
                      fontSize: 14, color: hasEval ? "var(--text-muted)" : "transparent",
                      transition: "transform 0.2s",
                      transform: isExpanded ? "rotate(90deg)" : "none",
                      textAlign: "center",
                    }}>
                      ▸
                    </span>
                  </div>

                  {/* Expanded evaluation panel */}
                  {isExpanded && r.evaluation && (() => {
                    const parsed = parseEvaluation(r.evaluation);
                    const phases = groupByPhase(r.completed_items);
                    return (
                      <div style={{
                        padding: "0 20px 20px", borderBottom: "1px solid var(--border)",
                        background: "var(--bg-secondary)",
                      }}>
                        <div style={{
                          display: "grid", gridTemplateColumns: "1fr 280px", gap: 20,
                        }}>
                          {/* Left: evaluation text */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {parsed.evaluation && (
                              <div>
                                <h4 style={{
                                  fontSize: 13, fontWeight: 600, color: "var(--text-muted)",
                                  textTransform: "uppercase", letterSpacing: "0.05em",
                                  margin: "0 0 8px",
                                }}>
                                  Evaluaci&oacute;n
                                </h4>
                                <p style={{
                                  fontSize: 14, lineHeight: 1.6, color: "var(--text-primary)",
                                  margin: 0, whiteSpace: "pre-line",
                                }}>
                                  {parsed.evaluation}
                                </p>
                              </div>
                            )}
                            {parsed.strengths && (
                              <div>
                                <h4 style={{
                                  fontSize: 13, fontWeight: 600, color: "var(--success)",
                                  margin: "0 0 8px",
                                }}>
                                  Puntos Fuertes
                                </h4>
                                <p style={{
                                  fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)",
                                  margin: 0, whiteSpace: "pre-line",
                                }}>
                                  {parsed.strengths}
                                </p>
                              </div>
                            )}
                            {parsed.improvements && (
                              <div>
                                <h4 style={{
                                  fontSize: 13, fontWeight: 600, color: "var(--warning)",
                                  margin: "0 0 8px",
                                }}>
                                  &Aacute;reas de Mejora
                                </h4>
                                <p style={{
                                  fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)",
                                  margin: 0, whiteSpace: "pre-line",
                                }}>
                                  {parsed.improvements}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Right: checklist by phase */}
                          <div style={{
                            background: "var(--bg-surface)", borderRadius: 12,
                            padding: 16, fontSize: 13,
                          }}>
                            <h4 style={{
                              fontSize: 13, fontWeight: 600, color: "var(--text-muted)",
                              textTransform: "uppercase", letterSpacing: "0.05em",
                              margin: "0 0 12px",
                            }}>
                              Checklist ({r.score}/{CHECKLIST_TOTAL})
                            </h4>
                            {Object.entries(PHASE_NAMES).map(([fase, name]) => {
                              const phaseItems = CHECKLIST.filter(c => c.fase === parseInt(fase));
                              const completedInPhase = phases[fase] || [];
                              return (
                                <div key={fase} style={{ marginBottom: 10 }}>
                                  <div style={{
                                    fontSize: 11, fontWeight: 600, color: PHASE_COLORS[fase],
                                    marginBottom: 4,
                                  }}>
                                    F{fase}: {name} ({completedInPhase.length}/{phaseItems.length})
                                  </div>
                                  {phaseItems.map(item => {
                                    const done = completedInPhase.some(c => c.id === item.id);
                                    return (
                                      <div key={item.id} style={{
                                        display: "flex", alignItems: "center", gap: 6,
                                        padding: "2px 0", color: done ? "var(--text-primary)" : "var(--text-muted)",
                                        fontSize: 12,
                                      }}>
                                        <span style={{ fontSize: 11 }}>{done ? "✓" : "○"}</span>
                                        <span style={{ textDecoration: done ? "none" : "none", opacity: done ? 1 : 0.5 }}>
                                          {item.label}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Sessions List View ────────────────────────────────────────
  return (
    <div>
      {/* Create session */}
      <div style={{
        background: "var(--bg-surface)", borderRadius: 16, padding: "24px",
        boxShadow: "var(--shadow-sm)", marginBottom: 24,
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <h3 style={{
          fontFamily: "'DM Serif Display', serif", fontSize: 18,
          color: "var(--text-primary)", fontWeight: 400, margin: 0,
        }}>
          Nueva Sesi&oacute;n
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>Duraci&oacute;n:</label>
          <input type="number" value={duration} onChange={e => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
            min={1} max={120} style={{
              width: 60, padding: "8px 10px", borderRadius: 8,
              border: "1px solid var(--border)", fontSize: 14, textAlign: "center",
            }} />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>min</span>
        </div>
        <button onClick={createSession} disabled={creating} style={{
          background: "var(--accent)", color: "#fff", border: "none",
          padding: "10px 24px", borderRadius: 10, cursor: creating ? "default" : "pointer",
          fontSize: 14, fontWeight: 500, opacity: creating ? 0.7 : 1,
        }}>
          {creating ? "Creando..." : "Crear Sesi\u00f3n"}
        </button>
      </div>

      {/* Sessions table */}
      <h2 style={{
        fontFamily: "'DM Serif Display', serif", fontSize: 24,
        color: "var(--text-primary)", fontWeight: 400, margin: "0 0 16px",
      }}>
        Sesiones
      </h2>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</div>
      ) : sessions.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "60px 20px", color: "var(--text-muted)",
          background: "var(--bg-surface)", borderRadius: 16,
        }}>
          No hay sesiones todav&iacute;a. Crea la primera.
        </div>
      ) : (
        <div style={{
          background: "var(--bg-surface)", borderRadius: 16,
          boxShadow: "var(--shadow-sm)", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "80px 100px 90px 120px 100px 1fr",
            padding: "12px 20px", borderBottom: "1px solid var(--border)",
            fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
            textTransform: "uppercase", letterSpacing: "0.05em",
          }}>
            <span>Estado</span><span>Duraci&oacute;n</span><span>Jugadores</span>
            <span>Creada</span><span>Creador</span><span style={{ textAlign: "right" }}>Acciones</span>
          </div>

          {/* Rows */}
          {sessions.map(s => {
            const st = STATUS_STYLES[s.status];
            return (
              <div key={s.id} style={{
                display: "grid", gridTemplateColumns: "80px 100px 90px 120px 100px 1fr",
                padding: "14px 20px", borderBottom: "1px solid var(--border)",
                alignItems: "center",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-secondary)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span style={{
                  display: "inline-block", padding: "3px 10px", borderRadius: 6,
                  fontSize: 11, fontWeight: 600, background: st.bg, color: st.color,
                  textAlign: "center", maxWidth: 70,
                }}>
                  {st.label}
                </span>
                <span style={{ fontSize: 14, color: "var(--text-primary)" }}>
                  {s.duration_min} min
                </span>
                <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  {s.participant_count || 0}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {timeAgo(s.created_at)}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {s.created_by_name || "—"}
                </span>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {s.status === 'created' && (
                    <button onClick={() => startSession(s.id)} style={{
                      background: "var(--success)", color: "#fff", border: "none",
                      padding: "6px 16px", borderRadius: 8, cursor: "pointer",
                      fontSize: 13, fontWeight: 500,
                    }}>
                      Iniciar
                    </button>
                  )}
                  {s.status === 'active' && (
                    <>
                      <button onClick={() => viewRanking(s.id)} style={{
                        background: "var(--accent)", color: "#fff", border: "none",
                        padding: "6px 16px", borderRadius: 8, cursor: "pointer",
                        fontSize: 13, fontWeight: 500,
                      }}>
                        Ver Ranking
                      </button>
                      <button onClick={() => stopSession(s.id)} style={{
                        background: "var(--danger)", color: "#fff", border: "none",
                        padding: "6px 16px", borderRadius: 8, cursor: "pointer",
                        fontSize: 13, fontWeight: 500,
                      }}>
                        Detener
                      </button>
                    </>
                  )}
                  {s.status === 'finished' && (
                    <button onClick={() => viewRanking(s.id)} style={{
                      background: "transparent", border: "1px solid var(--border)",
                      color: "var(--text-secondary)", padding: "6px 16px", borderRadius: 8,
                      cursor: "pointer", fontSize: 13,
                    }}>
                      Ver Resultados
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
