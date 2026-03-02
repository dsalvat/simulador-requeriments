import { CLIENT_ID } from './clientId';

function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export function apiFetch(url, options = {}) {
  const headers = {
    ...options.headers,
    ...getAuthHeaders(),
    'X-Client-Id': CLIENT_ID,
  };
  return fetch(url, { ...options, headers });
}

export async function callClaude(messages, systemPrompt) {
  try {
    const res = await apiFetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: systemPrompt,
        messages
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.content?.map(b => b.text || "").join("\n") || "Error de conexión.";
  } catch (e) {
    console.error('API error:', e);
    return `Error de conexión: ${e.message}. Verifica que el servidor está activo.`;
  }
}

export async function checkServicesStatus() {
  try {
    const res = await fetch('/api/services-status');
    return await res.json();
  } catch {
    return { claude: false, elevenlabs: false, deepgram: false, simli: false, saasReady: false };
  }
}

export async function sendHeartbeat(state) {
  try {
    await apiFetch('/api/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
  } catch {}
}

export async function reportUsage(service, metrics) {
  try {
    await apiFetch('/api/usage/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service, ...metrics })
    });
  } catch {}
}

export async function fetchDashboardUsage(from) {
  const params = from ? `?from=${from}` : '';
  const res = await apiFetch(`/api/dashboard/usage${params}`);
  return res.json();
}
