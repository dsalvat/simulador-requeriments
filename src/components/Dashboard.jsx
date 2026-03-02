import { useState, useEffect, useRef, useCallback } from "react";
import { fetchDashboardUsage } from "../api";
import { COST_RATES } from "../data";

const SCREEN_LABELS = {
  select: "Selecci\u00f3n",
  chat: "Xat",
  eval: "Avaluaci\u00f3",
  admin: "Admin",
  disconnected: "Desconnectat",
  unknown: "Desconegut"
};

const SERVICE_CONFIG = {
  anthropic: { label: "Anthropic", icon: "\uD83E\uDD16", unitLabel: "tokens" },
  elevenlabs: { label: "ElevenLabs", icon: "\uD83D\uDD0A", unitLabel: "car\u00e0cters" },
  deepgram: { label: "Deepgram", icon: "\uD83C\uDFA4", unitLabel: "minuts" },
  simli: { label: "Simli", icon: "\uD83C\uDFAD", unitLabel: "minuts" }
};

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

function formatCost(n) {
  return n.toFixed(4) + " \u20AC";
}

function formatUnit(service, details) {
  if (service === "anthropic") {
    const total = (details.inputTokens || 0) + (details.outputTokens || 0);
    return total > 1000 ? `${(total / 1000).toFixed(1)}K tok.` : `${total} tok.`;
  }
  if (service === "elevenlabs") {
    const c = details.characters || 0;
    return c > 1000 ? `${(c / 1000).toFixed(1)}K car.` : `${c} car.`;
  }
  if (service === "deepgram") return `${((details.audioSeconds || 0) / 60).toFixed(1)} min`;
  if (service === "simli") return `${((details.durationSeconds || 0) / 60).toFixed(1)} min`;
  return "";
}

export default function Dashboard({ onBack }) {
  const [clients, setClients] = useState([]);
  const [usage, setUsage] = useState(null);
  const [filter, setFilter] = useState("today");
  const [refreshing, setRefreshing] = useState(false);
  const sseRef = useRef(null);

  // SSE for real-time clients
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const es = new EventSource(`/api/dashboard/stream?token=${token}`);
    sseRef.current = es;

    es.addEventListener("clients", (e) => {
      try { setClients(JSON.parse(e.data)); } catch {}
    });

    es.onerror = () => {
      // SSE will auto-reconnect, but if auth fails we fallback to polling
      setTimeout(async () => {
        try {
          const res = await fetch("/api/dashboard/clients", {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (res.ok) {
            const data = await res.json();
            setClients(data.clients);
          }
        } catch {}
      }, 2000);
    };

    return () => es.close();
  }, []);

  // Fetch usage data
  const loadUsage = useCallback(async () => {
    setRefreshing(true);
    let from = null;
    const now = new Date();
    if (filter === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    } else if (filter === "week") {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      from = d.toISOString();
    }
    try {
      const data = await fetchDashboardUsage(from);
      setUsage(data);
    } catch {}
    setRefreshing(false);
  }, [filter]);

  useEffect(() => { loadUsage(); }, [loadUsage]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(loadUsage, 30000);
    return () => clearInterval(iv);
  }, [loadUsage]);

  const totalCost = usage?.summary
    ? Object.values(usage.summary).reduce((acc, s) => acc + (s.cost || 0), 0)
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", padding: "24px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 28, animation: "fadeSlideUp 0.4s ease-out"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={onBack} style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "8px 16px", cursor: "pointer",
              fontSize: 13, fontWeight: 600, color: "var(--text-secondary)"
            }}>{"\u2190"} Tornar</button>
            <h1 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 26, fontWeight: 400,
              color: "var(--text-primary)", margin: 0
            }}>Panell de Monitoratge</h1>
          </div>
          <button onClick={loadUsage} disabled={refreshing} style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "8px 16px", cursor: "pointer",
            fontSize: 13, color: "var(--text-secondary)",
            opacity: refreshing ? 0.5 : 1
          }}>{refreshing ? "..." : "\u21BB Actualitzar"}</button>
        </div>

        {/* Connected Users */}
        <div style={{
          background: "var(--bg-surface)", borderRadius: 14, padding: 20,
          border: "1px solid var(--border)", marginBottom: 20,
          animation: "fadeSlideUp 0.4s ease-out 0.1s both"
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "var(--text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 8
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: clients.length > 0 ? "var(--success)" : "var(--text-muted)",
              display: "inline-block",
              animation: clients.length > 0 ? "pulse 2s infinite" : "none"
            }} />
            Usuaris Connectats ({clients.length})
          </div>

          {clients.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>
              Cap usuari connectat ara mateix
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["Client", "Usuari", "Pantalla", "Persona", "Mode", "Connectat fa"].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "8px 10px", fontWeight: 600,
                        color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase",
                        letterSpacing: "0.04em"
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px", fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>{c.id}</td>
                      <td style={{ padding: "10px", color: "var(--text-primary)", fontWeight: 500 }}>{c.userName || "?"}</td>
                      <td style={{ padding: "10px" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: c.screen === "chat" ? "var(--accent-subtle)" : "var(--bg-secondary)",
                          color: c.screen === "chat" ? "var(--accent)" : "var(--text-secondary)"
                        }}>{SCREEN_LABELS[c.screen] || c.screen}</span>
                      </td>
                      <td style={{ padding: "10px", color: c.personaName ? "var(--text-primary)" : "var(--text-muted)" }}>
                        {c.personaName || "\u2014"}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: c.mode === "saas" ? "var(--success)" : "var(--warning)"
                        }}>{c.mode === "saas" ? "SaaS" : c.mode === "fallback" ? "Local" : "\u2014"}</span>
                      </td>
                      <td style={{ padding: "10px", color: "var(--text-muted)", fontSize: 12 }}>
                        {timeAgo(c.connectedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Usage Summary */}
        <div style={{
          background: "var(--bg-surface)", borderRadius: 14, padding: 20,
          border: "1px solid var(--border)", marginBottom: 20,
          animation: "fadeSlideUp 0.4s ease-out 0.2s both"
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 14
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: "var(--text-secondary)",
              textTransform: "uppercase", letterSpacing: "0.05em"
            }}>Consum per Servei</div>
            <div style={{ display: "flex", gap: 4, background: "var(--bg-secondary)", borderRadius: 8, padding: 3 }}>
              {[
                { key: "today", label: "Avui" },
                { key: "week", label: "Setmana" },
                { key: "all", label: "Tot" }
              ].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} style={{
                  padding: "5px 14px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600,
                  cursor: "pointer",
                  background: filter === f.key ? "var(--accent)" : "transparent",
                  color: filter === f.key ? "var(--text-inverse)" : "var(--text-muted)",
                  transition: "all 0.2s"
                }}>{f.label}</button>
              ))}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Servei", "Crides", "Unitats", "Cost estimat"].map(h => (
                    <th key={h} style={{
                      textAlign: "left", padding: "8px 10px", fontWeight: 600,
                      color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase",
                      letterSpacing: "0.04em"
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(SERVICE_CONFIG).map(svc => {
                  const data = usage?.summary?.[svc];
                  const cfg = SERVICE_CONFIG[svc];
                  return (
                    <tr key={svc} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {cfg.icon} {cfg.label}
                      </td>
                      <td style={{ padding: "10px", color: "var(--text-secondary)" }}>
                        {data?.calls || 0}
                      </td>
                      <td style={{ padding: "10px", color: "var(--text-secondary)" }}>
                        {data ? formatUnit(svc, data.details) : "\u2014"}
                      </td>
                      <td style={{ padding: "10px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {data ? formatCost(data.cost) : "0.0000 \u20AC"}
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan="2" />
                  <td style={{ padding: "10px", fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>TOTAL</td>
                  <td style={{ padding: "10px", fontWeight: 700, color: "var(--accent)", fontSize: 15 }}>
                    {formatCost(totalCost)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Events */}
        <div style={{
          background: "var(--bg-surface)", borderRadius: 14, padding: 20,
          border: "1px solid var(--border)",
          animation: "fadeSlideUp 0.4s ease-out 0.3s both"
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: "var(--text-secondary)",
            textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14
          }}>
            Detall Recent ({usage?.recent?.length || 0} events)
          </div>

          {!usage?.recent?.length ? (
            <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "12px 0" }}>
              Cap event registrat
            </div>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 400, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--bg-surface)" }}>
                    {["Data/hora", "Usuari", "Servei", "Detall", "Cost"].map(h => (
                      <th key={h} style={{
                        textAlign: "left", padding: "8px 10px", fontWeight: 600,
                        color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase",
                        letterSpacing: "0.04em"
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usage.recent.map((ev, i) => {
                    const cfg = SERVICE_CONFIG[ev.service] || { label: ev.service, icon: "?" };
                    const time = new Date(ev.timestamp);
                    const detail = ev.service === "anthropic"
                      ? `${ev.inputTokens || 0}+${ev.outputTokens || 0} tok`
                      : ev.service === "elevenlabs"
                      ? `${ev.characters || 0} car, ${(ev.audioDurationSec || 0).toFixed(1)}s`
                      : ev.service === "deepgram"
                      ? `${(ev.audioSeconds || 0).toFixed(1)}s`
                      : ev.service === "simli"
                      ? `${((ev.durationSeconds || 0) / 60).toFixed(1)} min`
                      : JSON.stringify(ev);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 10px", color: "var(--text-muted)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                          {time.toLocaleTimeString("ca-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary)" }}>
                          {ev.userName || ev.clientId?.slice(0, 5) || "?"}
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                            background: "var(--bg-secondary)", color: "var(--text-secondary)"
                          }}>{cfg.icon} {cfg.label}</span>
                        </td>
                        <td style={{ padding: "8px 10px", color: "var(--text-secondary)", fontSize: 12 }}>{detail}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {formatCost(ev.cost || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
