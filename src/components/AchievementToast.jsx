import { useEffect, useState } from "react";
import { PHASE_NAMES, PHASE_COLORS } from "../data";

const CONFETTI_COLORS = ["#C45D3E", "#3A8A5C", "#2E75B6", "#E67E22", "#8E44AD", "#C0392B"];

function SingleToast({ toast, index, onDismiss }) {
  const [exiting, setExiting] = useState(false);
  const color = PHASE_COLORS[toast.fase] || "#C45D3E";

  useEffect(() => {
    const exitTimer = setTimeout(() => setExiting(true), 3600);
    const removeTimer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => { clearTimeout(exitTimer); clearTimeout(removeTimer); };
  }, [toast.id, onDismiss]);

  // Generate confetti particles with deterministic positions based on index
  const confetti = Array.from({ length: 6 }, (_, i) => ({
    left: 10 + i * 16,
    top: 4 + (i % 3) * 8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: i * 0.08,
    size: 4 + (i % 3) * 2,
  }));

  return (
    <div style={{
      animation: exiting ? "toastSlideOut 0.4s ease-in forwards" : "toastSlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
      animationDelay: exiting ? "0s" : `${index * 0.15}s`,
      opacity: exiting ? undefined : 0,
      display: "flex",
      alignItems: "stretch",
      background: "var(--bg-surface)",
      borderRadius: 12,
      boxShadow: "0 8px 32px rgba(26,26,26,0.15), 0 2px 8px rgba(26,26,26,0.08)",
      overflow: "hidden",
      minWidth: 260,
      maxWidth: 320,
      position: "relative",
    }}>
      {/* Phase color bar */}
      <div style={{
        width: 5,
        background: color,
        flexShrink: 0,
        borderRadius: "12px 0 0 12px",
      }} />

      {/* Content */}
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
        {/* Check icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: color + "18",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          fontSize: 16,
        }}>
          <span style={{ color, fontWeight: 700 }}>✓</span>
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {toast.itemId} — {toast.label}
          </div>
          <div style={{
            fontSize: 11, color: color, fontWeight: 500, marginTop: 1,
          }}>
            Fase {toast.fase}: {PHASE_NAMES[toast.fase]}
          </div>
        </div>
      </div>

      {/* Confetti particles */}
      {confetti.map((c, i) => (
        <div key={i} style={{
          position: "absolute",
          left: c.left + "%",
          top: c.top,
          width: c.size,
          height: c.size,
          borderRadius: c.size > 5 ? 2 : "50%",
          background: c.color,
          animation: `confettiFall 1s ease-out ${c.delay}s forwards`,
          opacity: 0.8,
          pointerEvents: "none",
        }} />
      ))}
    </div>
  );
}

export default function AchievementToast({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div style={{
      position: "absolute",
      top: 12,
      right: 16,
      zIndex: 200,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      pointerEvents: "none",
    }}>
      {toasts.map((toast, i) => (
        <div key={toast.id} style={{ pointerEvents: "auto" }}>
          <SingleToast toast={toast} index={i} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
