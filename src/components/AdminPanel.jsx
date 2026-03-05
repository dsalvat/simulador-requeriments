import { useState, useEffect, useCallback } from "react";
import SessionManager from "./SessionManager.jsx";

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
  const [activeTab, setActiveTab] = useState("sessions");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("user");
  const [inviteError, setInviteError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("user");
  const [editOrgs, setEditOrgs] = useState([]); // [{organization_id, role, name}]

  // Organizations state
  const [organizations, setOrganizations] = useState([]);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [editOrg, setEditOrg] = useState(null);
  const [orgName, setOrgName] = useState("");
  const [selectedOrg, setSelectedOrg] = useState(null); // org being managed (members view)
  const [orgMembers, setOrgMembers] = useState([]);
  const [orgFormations, setOrgFormations] = useState([]);
  const [allFormations, setAllFormations] = useState([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberUserId, setAddMemberUserId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("alumne");

  const fetchUsers = useCallback(async () => {
    const res = await fetch('/api/admin/users', { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
    setLoading(false);
  }, []);

  const fetchOrganizations = useCallback(async () => {
    const res = await fetch('/api/admin/organizations', { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setOrganizations(data.organizations);
    }
  }, []);

  const fetchFormations = useCallback(async () => {
    const res = await fetch('/api/formations', { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setAllFormations(data.formations);
    }
  }, []);

  const fetchOrgMembers = useCallback(async (orgId) => {
    const res = await fetch(`/api/admin/organizations/${orgId}/members`, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setOrgMembers(data.members);
    }
  }, []);

  const fetchOrgFormations = useCallback(async (orgId) => {
    const res = await fetch(`/api/admin/organizations/${orgId}/formations`, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setOrgFormations(data.formations.map(f => f.id));
    }
  }, []);

  useEffect(() => { fetchUsers(); fetchOrganizations(); fetchFormations(); }, [fetchUsers, fetchOrganizations, fetchFormations]);

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

  const openEdit = async (u) => {
    setEditUser(u);
    setEditName(u.name || "");
    setEditRole(u.role || "user");
    // Load user's org memberships
    const res = await fetch(`/api/admin/users/${u.id}/organizations`, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      setEditOrgs(data.organizations);
    } else {
      setEditOrgs([]);
    }
  };

  const handleEditSave = async () => {
    if (!editUser) return;
    await fetch(`/api/admin/users/${editUser.id}`, {
      method: 'PATCH', headers: getAuthHeaders(),
      body: JSON.stringify({ name: editName || null, role: editRole }),
    });
    // Save org memberships
    await fetch(`/api/admin/users/${editUser.id}/organizations`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ organizations: editOrgs }),
    });
    setEditUser(null);
    fetchUsers();
  };

  // Organization CRUD
  const handleSaveOrg = async () => {
    if (editOrg) {
      await fetch(`/api/admin/organizations/${editOrg.id}`, {
        method: 'PATCH', headers: getAuthHeaders(),
        body: JSON.stringify({ name: orgName }),
      });
    } else {
      await fetch('/api/admin/organizations', {
        method: 'POST', headers: getAuthHeaders(),
        body: JSON.stringify({ name: orgName }),
      });
    }
    setShowOrgModal(false);
    setEditOrg(null);
    setOrgName("");
    fetchOrganizations();
  };

  const toggleOrgActive = async (org) => {
    await fetch(`/api/admin/organizations/${org.id}`, {
      method: 'PATCH', headers: getAuthHeaders(),
      body: JSON.stringify({ active: !org.active }),
    });
    fetchOrganizations();
  };

  const deleteOrg = async (orgId) => {
    await fetch(`/api/admin/organizations/${orgId}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    });
    if (selectedOrg?.id === orgId) setSelectedOrg(null);
    fetchOrganizations();
  };

  const openOrgMembers = async (org) => {
    setSelectedOrg(org);
    await fetchOrgMembers(org.id);
    await fetchOrgFormations(org.id);
  };

  const addOrgMember = async () => {
    if (!addMemberUserId || !selectedOrg) return;
    await fetch(`/api/admin/organizations/${selectedOrg.id}/members`, {
      method: 'POST', headers: getAuthHeaders(),
      body: JSON.stringify({ user_id: parseInt(addMemberUserId), role: addMemberRole }),
    });
    setShowAddMember(false);
    setAddMemberUserId("");
    setAddMemberRole("alumne");
    fetchOrgMembers(selectedOrg.id);
    fetchOrganizations();
  };

  const changeOrgMemberRole = async (userId, role) => {
    if (!selectedOrg) return;
    await fetch(`/api/admin/organizations/${selectedOrg.id}/members/${userId}`, {
      method: 'PATCH', headers: getAuthHeaders(),
      body: JSON.stringify({ role }),
    });
    fetchOrgMembers(selectedOrg.id);
  };

  const removeOrgMember = async (userId) => {
    if (!selectedOrg) return;
    await fetch(`/api/admin/organizations/${selectedOrg.id}/members/${userId}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    });
    fetchOrgMembers(selectedOrg.id);
    fetchOrganizations();
  };

  const toggleOrgFormation = async (formationId) => {
    if (!selectedOrg) return;
    const newIds = orgFormations.includes(formationId)
      ? orgFormations.filter(id => id !== formationId)
      : [...orgFormations, formationId];
    await fetch(`/api/admin/organizations/${selectedOrg.id}/formations`, {
      method: 'PUT', headers: getAuthHeaders(),
      body: JSON.stringify({ formation_ids: newIds }),
    });
    setOrgFormations(newIds);
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
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 32, borderBottom: "2px solid var(--border)" }}>
          {[
            { id: "sessions", label: "Sesiones de Juego" },
            { id: "users", label: "Usuarios" },
            { id: "orgs", label: "Empresas" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              background: "none", border: "none", padding: "12px 24px",
              fontSize: 15, fontWeight: activeTab === tab.id ? 600 : 400, cursor: "pointer",
              color: activeTab === tab.id ? "var(--accent)" : "var(--text-muted)",
              borderBottom: activeTab === tab.id ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -2, transition: "all 0.2s",
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "sessions" && <SessionManager />}

        {activeTab === "users" && <>
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
              display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 80px 70px 90px 100px",
              padding: "12px 20px", borderBottom: "1px solid var(--border)",
              fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              <span>Nombre</span><span>Email</span><span>Organizaciones</span><span>Rol</span>
              <span>Estado</span><span>&Uacute;ltimo acceso</span><span></span>
            </div>

            {/* User rows */}
            {users.map(u => {
              const orgs = Array.isArray(u.organizations) ? u.organizations : [];
              const roleLabel = { alumne: "A", professor: "P", admin: "D" };
              const roleColor = { alumne: "#6366f1", professor: "#059669", admin: "#dc2626" };
              return (
              <div key={u.id} style={{
                display: "grid", gridTemplateColumns: "1fr 1.2fr 1fr 80px 70px 90px 100px",
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
                <span style={{ fontSize: 13, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                {/* Organizations */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {orgs.map((m, i) => (
                    <span key={i} style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                      background: "var(--bg-secondary)", color: "var(--text-secondary)",
                      maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {m.org_name}
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 16, height: 16, borderRadius: 4, fontSize: 9, fontWeight: 700,
                        background: roleColor[m.role] || "#888", color: "#fff", flexShrink: 0,
                      }}>
                        {roleLabel[m.role] || "?"}
                      </span>
                    </span>
                  ))}
                </div>
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
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => openEdit(u)} style={{
                    background: "none", border: "none", color: "var(--accent)",
                    cursor: "pointer", fontSize: 12, fontWeight: 500, padding: "4px 8px",
                  }}>
                    Editar
                  </button>
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
              );
            })}
          </div>
        )}
        </>}

        {activeTab === "orgs" && <>
          {/* Org action bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 24,
              color: "var(--text-primary)", fontWeight: 400, margin: 0,
            }}>
              Empresas
            </h2>
            <button onClick={() => { setEditOrg(null); setOrgName(""); setShowOrgModal(true); }} style={{
              background: "var(--accent)", color: "#fff", border: "none",
              padding: "10px 20px", borderRadius: 10, cursor: "pointer",
              fontSize: 14, fontWeight: 500,
            }}>
              + Nueva empresa
            </button>
          </div>

          <div style={{ display: "flex", gap: 24 }}>
            {/* Org list */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                background: "var(--bg-surface)", borderRadius: 16,
                boxShadow: "var(--shadow-sm)", overflow: "hidden",
              }}>
                {organizations.length === 0 ? (
                  <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
                    No hay empresas creadas
                  </div>
                ) : organizations.map(org => (
                  <div key={org.id} onClick={() => openOrgMembers(org)} style={{
                    padding: "14px 20px", borderBottom: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    cursor: "pointer", transition: "background 0.15s",
                    background: selectedOrg?.id === org.id ? "var(--accent-subtle)" : "transparent",
                  }}
                  onMouseEnter={e => { if (selectedOrg?.id !== org.id) e.currentTarget.style.background = "var(--bg-secondary)"; }}
                  onMouseLeave={e => { if (selectedOrg?.id !== org.id) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{org.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {org.member_count || 0} miembros
                        {!org.active && <span style={{ color: "var(--danger)", marginLeft: 8 }}>Inactiva</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={e => { e.stopPropagation(); setEditOrg(org); setOrgName(org.name); setShowOrgModal(true); }} style={{
                        background: "none", border: "none", color: "var(--accent)",
                        cursor: "pointer", fontSize: 12, fontWeight: 500, padding: "4px 8px",
                      }}>
                        Editar
                      </button>
                      <button onClick={e => { e.stopPropagation(); toggleOrgActive(org); }} style={{
                        background: "none", border: "none", color: org.active ? "var(--text-muted)" : "var(--success)",
                        cursor: "pointer", fontSize: 12, fontWeight: 500, padding: "4px 8px",
                      }}>
                        {org.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Org detail panel */}
            {selectedOrg && (
              <div style={{ flex: 1.5, minWidth: 0 }}>
                <div style={{
                  background: "var(--bg-surface)", borderRadius: 16, padding: 24,
                  boxShadow: "var(--shadow-sm)",
                }}>
                  <h3 style={{
                    fontFamily: "'DM Serif Display', serif", fontSize: 20, fontWeight: 400,
                    color: "var(--text-primary)", margin: "0 0 20px",
                  }}>
                    {selectedOrg.name}
                  </h3>

                  {/* Formations */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Formaciones disponibles
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {allFormations.map(f => (
                        <button key={f.id} onClick={() => toggleOrgFormation(f.id)} style={{
                          padding: "6px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                          border: orgFormations.includes(f.id) ? "2px solid var(--accent)" : "1px solid var(--border)",
                          background: orgFormations.includes(f.id) ? "var(--accent-subtle)" : "transparent",
                          color: orgFormations.includes(f.id) ? "var(--accent)" : "var(--text-secondary)",
                          fontWeight: orgFormations.includes(f.id) ? 600 : 400,
                        }}>
                          {f.name}
                        </button>
                      ))}
                      {allFormations.length === 0 && (
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>No hay formaciones en la base de datos</span>
                      )}
                    </div>
                  </div>

                  {/* Members */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Miembros ({orgMembers.length})
                    </div>
                    <button onClick={() => setShowAddMember(true)} style={{
                      background: "var(--accent)", color: "#fff", border: "none",
                      padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 500,
                    }}>
                      + A&ntilde;adir
                    </button>
                  </div>

                  {orgMembers.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                      Sin miembros
                    </div>
                  ) : orgMembers.map(m => (
                    <div key={m.user_id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 0", borderBottom: "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar user={m} size={30} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>{m.name || m.email}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.email}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <select value={m.role} onChange={e => changeOrgMemberRole(m.user_id, e.target.value)} style={{
                          padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)",
                          fontSize: 12, background: "var(--bg-primary)", color: "var(--text-primary)",
                        }}>
                          <option value="admin">Admin</option>
                          <option value="professor">Professor</option>
                          <option value="alumne">Alumne</option>
                        </select>
                        <button onClick={() => removeOrgMember(m.user_id)} style={{
                          background: "none", border: "none", color: "var(--danger)",
                          cursor: "pointer", fontSize: 16, padding: "2px 6px", lineHeight: 1,
                        }}>
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Add member inline */}
                  {showAddMember && (
                    <div style={{
                      marginTop: 12, padding: 16, borderRadius: 10,
                      background: "var(--bg-primary)", border: "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Usuario</label>
                          <select value={addMemberUserId} onChange={e => setAddMemberUserId(e.target.value)} style={{
                            width: "100%", padding: "8px 10px", borderRadius: 8,
                            border: "1px solid var(--border)", fontSize: 13,
                            background: "var(--bg-surface)", color: "var(--text-primary)",
                          }}>
                            <option value="">Seleccionar...</option>
                            {users.filter(u => u.active && !orgMembers.find(m => m.user_id === u.id)).map(u => (
                              <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Rol</label>
                          <select value={addMemberRole} onChange={e => setAddMemberRole(e.target.value)} style={{
                            padding: "8px 10px", borderRadius: 8,
                            border: "1px solid var(--border)", fontSize: 13,
                            background: "var(--bg-surface)", color: "var(--text-primary)",
                          }}>
                            <option value="admin">Admin</option>
                            <option value="professor">Professor</option>
                            <option value="alumne">Alumne</option>
                          </select>
                        </div>
                        <button onClick={addOrgMember} disabled={!addMemberUserId} style={{
                          background: addMemberUserId ? "var(--accent)" : "var(--border)",
                          color: "#fff", border: "none", padding: "8px 16px", borderRadius: 8,
                          cursor: addMemberUserId ? "pointer" : "default", fontSize: 13, fontWeight: 500,
                        }}>
                          A&ntilde;adir
                        </button>
                        <button onClick={() => setShowAddMember(false)} style={{
                          background: "none", border: "1px solid var(--border)",
                          color: "var(--text-muted)", padding: "8px 12px", borderRadius: 8,
                          cursor: "pointer", fontSize: 13,
                        }}>
                          &times;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>}
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

      {/* Edit user modal */}
      {editUser && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setEditUser(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg-surface)", borderRadius: 16, padding: "32px",
            maxWidth: 420, width: "90%", boxShadow: "var(--shadow-xl)",
            animation: "scaleIn 0.2s ease-out",
          }}>
            <h3 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400,
              color: "var(--text-primary)", margin: "0 0 8px",
            }}>
              Editar usuario
            </h3>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
              {editUser.email}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Nombre
                </label>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="Nombre completo" style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: "1px solid var(--border)", fontSize: 14, outline: "none",
                    boxSizing: "border-box", background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Rol
                </label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  disabled={editUser.id === currentUser.id}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: "1px solid var(--border)", fontSize: 14, outline: "none",
                    background: "var(--bg-surface)", boxSizing: "border-box",
                    color: "var(--text-primary)",
                    opacity: editUser.id === currentUser.id ? 0.5 : 1,
                  }}>
                  <option value="user">Usuario</option>
                  <option value="admin">Admin</option>
                </select>
                {editUser.id === currentUser.id && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    No puedes cambiar tu propio rol
                  </div>
                )}
              </div>

              {/* Organization memberships */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Organizaciones
                </label>
                {editOrgs.map((eo, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 8, alignItems: "center", marginBottom: 6,
                  }}>
                    <select value={eo.organization_id} onChange={e => {
                      const updated = [...editOrgs];
                      const org = organizations.find(o => o.id === parseInt(e.target.value));
                      updated[i] = { ...updated[i], organization_id: parseInt(e.target.value), name: org?.name };
                      setEditOrgs(updated);
                    }} style={{
                      flex: 1, padding: "8px 10px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13,
                      background: "var(--bg-primary)", color: "var(--text-primary)",
                    }}>
                      {organizations.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <select value={eo.role} onChange={e => {
                      const updated = [...editOrgs];
                      updated[i] = { ...updated[i], role: e.target.value };
                      setEditOrgs(updated);
                    }} style={{
                      padding: "8px 10px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13,
                      background: "var(--bg-primary)", color: "var(--text-primary)",
                    }}>
                      <option value="admin">Admin</option>
                      <option value="professor">Professor</option>
                      <option value="alumne">Alumne</option>
                    </select>
                    <button onClick={() => setEditOrgs(editOrgs.filter((_, j) => j !== i))} style={{
                      background: "none", border: "none", color: "var(--danger)",
                      cursor: "pointer", fontSize: 16, padding: "2px 6px",
                    }}>
                      &times;
                    </button>
                  </div>
                ))}
                {organizations.length > 0 && (
                  <button onClick={() => setEditOrgs([...editOrgs, { organization_id: organizations[0].id, role: "alumne", name: organizations[0].name }])} style={{
                    background: "none", border: "1px dashed var(--border)", color: "var(--accent)",
                    padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, width: "100%",
                    marginTop: 4,
                  }}>
                    + A&ntilde;adir a organizaci&oacute;n
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => setEditUser(null)} style={{
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--text-secondary)", padding: "10px 20px", borderRadius: 10,
                cursor: "pointer", fontSize: 14,
              }}>
                Cancelar
              </button>
              <button onClick={handleEditSave} style={{
                background: "var(--accent)", color: "#fff", border: "none",
                padding: "10px 20px", borderRadius: 10, cursor: "pointer",
                fontSize: 14, fontWeight: 500,
              }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Org create/edit modal */}
      {showOrgModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowOrgModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg-surface)", borderRadius: 16, padding: "32px",
            maxWidth: 420, width: "90%", boxShadow: "var(--shadow-xl)",
            animation: "scaleIn 0.2s ease-out",
          }}>
            <h3 style={{
              fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400,
              color: "var(--text-primary)", margin: "0 0 20px",
            }}>
              {editOrg ? "Editar empresa" : "Nueva empresa"}
            </h3>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                Nombre
              </label>
              <input value={orgName} onChange={e => setOrgName(e.target.value)}
                placeholder="Nombre de la empresa" autoFocus style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10,
                  border: "1px solid var(--border)", fontSize: 14, outline: "none",
                  boxSizing: "border-box", background: "var(--bg-primary)", color: "var(--text-primary)",
                }} />
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => setShowOrgModal(false)} style={{
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--text-secondary)", padding: "10px 20px", borderRadius: 10,
                cursor: "pointer", fontSize: 14,
              }}>
                Cancelar
              </button>
              <button onClick={handleSaveOrg} disabled={!orgName.trim()} style={{
                background: orgName.trim() ? "var(--accent)" : "var(--border)",
                color: "#fff", border: "none", padding: "10px 20px", borderRadius: 10,
                cursor: orgName.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 500,
              }}>
                {editOrg ? "Guardar" : "Crear"}
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
