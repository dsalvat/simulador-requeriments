import { useState, useRef, useEffect } from "react";

export default function UserMenu({ user, onAdmin, onLogout }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = (user.name || user.email || "?").slice(0, 1).toUpperCase();

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} style={{
        display: "flex", alignItems: "center", gap: 8, background: "var(--bg-surface)",
        border: "1px solid var(--border)", borderRadius: 12, padding: "6px 12px 6px 6px",
        cursor: "pointer", transition: "box-shadow 0.2s",
        boxShadow: open ? "var(--shadow-md)" : "var(--shadow-sm)",
      }}>
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" style={{
            width: 30, height: 30, borderRadius: "50%", objectFit: "cover",
          }} />
        ) : (
          <div style={{
            width: 30, height: 30, borderRadius: "50%", background: "var(--accent-subtle)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--accent)", fontWeight: 600, fontSize: 13,
          }}>
            {initials}
          </div>
        )}
        <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
          {user.name || user.email}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
          transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s",
        }}>
          <path d="M3 4.5L6 7.5L9 4.5" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "var(--bg-surface)", borderRadius: 12, padding: 6,
          boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)",
          minWidth: 180, zIndex: 100, animation: "fadeIn 0.15s ease-out",
        }}>
          {user.role === "admin" && (
            <button onClick={() => { setOpen(false); onAdmin(); }} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              background: "transparent", border: "none", padding: "10px 14px",
              borderRadius: 8, cursor: "pointer", fontSize: 13,
              color: "var(--text-primary)", textAlign: "left",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-secondary)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Panel de administraci&oacute;n
            </button>
          )}
          <button onClick={() => { setOpen(false); onLogout(); }} style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            background: "transparent", border: "none", padding: "10px 14px",
            borderRadius: 8, cursor: "pointer", fontSize: 13,
            color: "var(--danger)", textAlign: "left",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--bg-secondary)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Cerrar sesi&oacute;n
          </button>
        </div>
      )}
    </div>
  );
}
