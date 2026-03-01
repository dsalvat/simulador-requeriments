import { useState, useEffect, useCallback } from "react";

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
}

function timeAgo(dateStr) {
  if (!dateStr) return "Nunca";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

function Avatar({ user, size = 36 }) {
  const initials = (user.name || user.email || "?").slice(0, 1).toUpperCase();
  return user.avatar_url ? (
    <img src={user.avatar_url} alt="" style={{
      width: size, height: size, borderRadius: "50%", objectFit: "cover",
    }} />
  ) : (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: "var(--accent-subtle)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "var(--accent)", fontWeight: 600, fontSize: size * 0.4,
    }}>
      {initials}
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!checked)} disabled={disabled} style={{
      width: 44, height: 24, borderRadius: 12, border: "none", cursor: disabled ? "default" : "pointer",
      background: checked ? "var(--success)" : "var(--border)", transition: "background 0.2s",
      position: "relative", padding: 0, opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%", background: "#fff",
        position: "absolute", top: 3, left: checked ? 23 : 3,
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
      }} />
    </button>
  );
}

export default function AdminPanel({ currentUser, onBack, onLogout }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteError, setInviteError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const toggleActive = async (id, active) => {
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH', headers: getAuthHeaders(),
      body: JSON.stringify({ active }),
    });
    fetchUsers();
  };

  const deleteUser = async (id) => {
    await fetch(`/api/admin/users/${id}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    });
    setConfirmDelete(null);
    fetchUsers();
  };

  const handleInvite = async () => {
    setInviteError("");
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ email: inviteEmail, name: inviteName || null, role: inviteRole }),
    });
    if (res.ok) {
      setShowInvite(false);
      setInviteEmail(""); setInviteName(""); setInviteRole("user");
      fetchUsers();
    } else {
      const data = await res.json();
      setInviteError(data.error || "Error al invitar");
    }
  };

  const activeCount = users.filter(u => u.active).length;
  const lastLogin = users.reduce((latest, u) =>
    u.last_login && (!latest || new Date(u.last_login) > new Date(latest)) ? u.last_login : latest, null);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Header */}
      <div style={{
        background: "var(--bg-deep)", padding: "0 24px", height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <h1 style={{
          fontFamily: "'DM Serif Display', serif", fontSize: 20,
          color: "var(--text-inverse)", fontWeight: 400, margin: 0,
        }}>
          Panel de Administraci&oacute;n
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Avatar user={currentUser} size={32} />
            <span style={{ color: "var(--text-inverse)", fontSize: 13 }}>{currentUser.name}</span>
          </div>
          <button onClick={onBack} style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
            color: "var(--text-inverse)", padding: "6px 14px", borderRadius: 8,
            cursor: "pointer", fontSize: 13,
          }}>
            Volver
          </button>
          <button onClick={onLogout} style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
            color: "var(--accent-light)", padding: "6px 14px", borderRadius: 8,
            cursor: "pointer", fontSize: 13,
          }}>
            Cerrar sesi&oacute;n
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Total usuarios", value: users.length, color: "var(--text-primary)" },
            { label: "Usuarios activos", value: activeCount, color: "var(--success)" },
            { label: "Último acceso", value: timeAgo(lastLogin), color: "var(--text-secondary)" },
          ].map((stat, i) => (
            <div key={i} style={{
              flex: 1, background: "var(--bg-surface)", borderRadius: 12, padding: "20px 24px",
              boxShadow: "var(--shadow-sm)",
            }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{stat.label}</div>
              <div style={{
                fontFamily: "'DM Serif Display', serif", fontSize: 28,
                color: stat.color, fontWeight: 400,
              }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>

        {/* Action bar */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20,
        }}>
          <h2 style={{
            fontFamily: "'DM Serif Display', serif", fontSize: 24,
            color: "var(--text-primary)", fontWeight: 400, margin: 0,
          }}>
            Usuarios
          </h2>
          <button onClick={() => setShowInvite(true)} style={{
            background: "var(--accent)", color: "#fff", border: "none",
            padding: "10px 20px", borderRadius: 10, cursor: "pointer",
            fontSize: 14, fontWeight: 500,
          }}>
            + Invitar usuario
          </button>
        </div>

        {/* Users list */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Cargando...</div>
        ) : (
          <div style={{
            background: "var(--bg-surface)", borderRadius: 16,
            boxShadow: "var(--shadow-sm)", overflow: "hidden",
          }}>
            {/* Header row */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1.5fr 80px 70px 100px 80px",
              padding: "12px 20px", borderBottom: "1px solid var(--border)",
              fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              <span>Nombre</span><span>Email</span><span>Rol</span>
              <span>Estado</span><span>&Uacute;ltimo acceso</span><span></span>
            </div>

            {/* User rows */}
            {users.map(u => (
              <div key={u.id} style={{
                display: "grid", gridTemplateColumns: "1fr 1.5fr 80px 70px 100px 80px",
                padding: "14px 20px", borderBottom: "1px solid var(--border)",
                alignItems: "center", transition: "background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--bg-secondary)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {/* Name + avatar */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar user={u} size={34} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                    {u.name || "—"}
                  </span>
                </div>
                {/* Email */}
                <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{u.email}</span>
                {/* Role badge */}
                <span style={{
                  display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11,
                  fontWeight: 600, textAlign: "center",
                  background: u.role === "admin" ? "var(--accent-subtle)" : "var(--bg-secondary)",
                  color: u.role === "admin" ? "var(--accent)" : "var(--text-secondary)",
                }}>
                  {u.role === "admin" ? "Admin" : "Usuario"}
                </span>
                {/* Active toggle */}
                <Toggle
                  checked={u.active}
                  onChange={(val) => toggleActive(u.id, val)}
                  disabled={u.id === currentUser.id}
                />
                {/* Last login */}
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {timeAgo(u.last_login)}
                </span>
                {/* Actions */}
                <div>
                  {u.id !== currentUser.id && (
                    <button onClick={() => setConfirmDelete(u)} style={{
                      background: "none", border: "none", color: "var(--danger)",
                      cursor: "pointer", fontSize: 12, fontWeight: 500, padding: "4px 8px",
                    }}>
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowInvite(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg-surface)", borderRadius: 16, padding: "32px",
            maxWidth: 420, width: "90%", boxShadow: "var(--shadow-xl)",
            animation: "scaleIn 0.2s ease-out",
          }}>
            <h3 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400,
              color: "var(--text-primary)", margin: "0 0 20px",
            }}>
              Invitar usuario
            </h3>

            {inviteError && (
              <div style={{
                padding: "10px 14px", borderRadius: 8, marginBottom: 16,
                background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13,
              }}>
                {inviteError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Email *
                </label>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com" style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: "1px solid var(--border)", fontSize: 14, outline: "none",
                    boxSizing: "border-box",
                  }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Nombre (opcional)
                </label>
                <input value={inviteName} onChange={e => setInviteName(e.target.value)}
                  placeholder="Nombre completo" style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: "1px solid var(--border)", fontSize: 14, outline: "none",
                    boxSizing: "border-box",
                  }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Rol
                </label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10,
                  border: "1px solid var(--border)", fontSize: 14, outline: "none",
                  background: "var(--bg-surface)", boxSizing: "border-box",
                }}>
                  <option value="user">Usuario</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => setShowInvite(false)} style={{
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--text-secondary)", padding: "10px 20px", borderRadius: 10,
                cursor: "pointer", fontSize: 14,
              }}>
                Cancelar
              </button>
              <button onClick={handleInvite} disabled={!inviteEmail.trim()} style={{
                background: inviteEmail.trim() ? "var(--accent)" : "var(--border)",
                color: "#fff", border: "none", padding: "10px 20px", borderRadius: 10,
                cursor: inviteEmail.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 500,
              }}>
                Invitar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg-surface)", borderRadius: 16, padding: "32px",
            maxWidth: 380, width: "90%", boxShadow: "var(--shadow-xl)",
            animation: "scaleIn 0.2s ease-out", textAlign: "center",
          }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", lineHeight: 1.6 }}>
              ¿Seguro que quieres eliminar a <strong>{confirmDelete.name || confirmDelete.email}</strong>?
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "center" }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--text-secondary)", padding: "10px 20px", borderRadius: 10,
                cursor: "pointer", fontSize: 14,
              }}>
                Cancelar
              </button>
              <button onClick={() => deleteUser(confirmDelete.id)} style={{
                background: "var(--danger)", color: "#fff", border: "none",
                padding: "10px 20px", borderRadius: 10, cursor: "pointer",
                fontSize: 14, fontWeight: 500,
              }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
