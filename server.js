import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { verifyGoogleToken, signToken, requireAuth, requireAdmin, checkOrgRole } from './lib/auth.js';
import { query } from './lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv ESM issues)
try {
  const envFile = readFileSync(join(__dirname, '.env'), 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
} catch {}

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const SIMLI_API_KEY = process.env.SIMLI_API_KEY;

if (!API_KEY) {
  console.error('\n❌ Error: ANTHROPIC_API_KEY no trobada.');
  console.error('   Crea un fitxer .env amb: ANTHROPIC_API_KEY=sk-ant-...\n');
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

// ── Monitoring: in-memory tracking ──────────────────────────────
const activeClients = new Map();  // clientId → { connectedAt, lastHeartbeat, screen, personaId, personaName, mode, userName }
const sseClients = new Set();     // Set<Response> for SSE

const USAGE_FILE = join(__dirname, 'data', 'usage.json');
const MAX_USAGE_EVENTS = 10000;

// Ensure usage tracking file exists at startup
try {
  mkdirSync(join(__dirname, 'data'), { recursive: true });
  if (!existsSync(USAGE_FILE)) {
    writeFileSync(USAGE_FILE, '[]');
    console.log('  ✓ Created usage file:', USAGE_FILE);
  } else {
    const initial = JSON.parse(readFileSync(USAGE_FILE, 'utf8'));
    console.log(`  ✓ Usage file loaded: ${initial.length} events`);
  }
} catch (err) {
  console.error('  ⚠ Cannot init usage file:', err.message);
}

function loadUsage() {
  try { return JSON.parse(readFileSync(USAGE_FILE, 'utf8')); }
  catch { return []; }
}

function appendUsage(event) {
  try {
    mkdirSync(join(__dirname, 'data'), { recursive: true });
    const events = loadUsage();
    events.push({ timestamp: new Date().toISOString(), ...event });
    if (events.length > MAX_USAGE_EVENTS) events.splice(0, events.length - MAX_USAGE_EVENTS);
    writeFileSync(USAGE_FILE, JSON.stringify(events, null, 2));
    console.log(`[Usage] ${event.service} · ${event.userName} · ${(event.cost || 0).toFixed(4)}€`);
  } catch (err) { console.error('Usage write error:', err.message); }
}

function computeSummary(events, from) {
  const filtered = from ? events.filter(e => e.timestamp >= from) : events;
  const summary = {};
  for (const e of filtered) {
    if (!summary[e.service]) summary[e.service] = { calls: 0, cost: 0, details: {} };
    const s = summary[e.service];
    s.calls++;
    s.cost += e.cost || 0;
    if (e.service === 'anthropic') {
      s.details.inputTokens = (s.details.inputTokens || 0) + (e.inputTokens || 0);
      s.details.outputTokens = (s.details.outputTokens || 0) + (e.outputTokens || 0);
    } else if (e.service === 'elevenlabs') {
      s.details.characters = (s.details.characters || 0) + (e.characters || 0);
      s.details.audioDurationSec = (s.details.audioDurationSec || 0) + (e.audioDurationSec || 0);
    } else if (e.service === 'deepgram') {
      s.details.audioSeconds = (s.details.audioSeconds || 0) + (e.audioSeconds || 0);
    } else if (e.service === 'simli') {
      s.details.durationSeconds = (s.details.durationSeconds || 0) + (e.durationSeconds || 0);
    }
  }
  return summary;
}

function broadcastSSE(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch { sseClients.delete(client); }
  }
}

// Cleanup stale clients every 10s
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, info] of activeClients) {
    if (now - info.lastHeartbeat > 30000) { activeClients.delete(id); changed = true; }
  }
  if (changed) broadcastSSE('clients', [...activeClients.entries()].map(([id, info]) => ({ id: id.slice(0, 5), ...info })));
}, 10000);

// ── Services status (public) ─────────────────────────────────────
app.get('/api/services-status', (req, res) => {
  res.json({
    claude: !!API_KEY,
    elevenlabs: !!ELEVENLABS_API_KEY,
    deepgram: !!DEEPGRAM_API_KEY,
    simli: !!SIMLI_API_KEY,
    saasReady: !!(ELEVENLABS_API_KEY && DEEPGRAM_API_KEY && SIMLI_API_KEY)
  });
});

// ── Auth: Google login ───────────────────────────────────────────
app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const googleUser = await verifyGoogleToken(token, process.env.GOOGLE_CLIENT_ID);
    const result = await query('SELECT * FROM users WHERE email = $1', [googleUser.email]);
    let user = result.rows[0];

    if (!user) return res.status(403).json({ error: 'not_registered' });
    if (!user.active) return res.status(403).json({ error: 'deactivated' });

    const updated = await query(
      `UPDATE users SET name = COALESCE($1, name), avatar_url = COALESCE($2, avatar_url),
       last_login = NOW() WHERE id = $3 RETURNING *`,
      [googleUser.name, googleUser.avatar_url, user.id]
    );
    user = updated.rows[0];

    // Load organization memberships
    const orgsResult = await query(
      `SELECT o.id, o.name, om.role
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1 AND o.active = true
       ORDER BY o.name`,
      [user.id]
    );

    const appToken = signToken(user);
    res.json({
      token: appToken,
      user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, role: user.role, organizations: orgsResult.rows }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: 'Error de autenticación' });
  }
});

// ── Auth: Current user profile ───────────────────────────────────
app.get('/api/auth/me', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  res.json({
    user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, role: user.role, organizations: user.organizations || [] }
  });
});

// ── Admin: List / Create users ───────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query(
    `SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.active, u.created_at, u.last_login,
       COALESCE(
         (SELECT json_agg(json_build_object('org_id', o.id, 'org_name', o.name, 'role', om.role))
          FROM organization_members om
          JOIN organizations o ON o.id = om.organization_id
          WHERE om.user_id = u.id), '[]'
       ) as organizations
     FROM users u ORDER BY u.created_at DESC`
  );
  res.json({ users: result.rows });
});

app.post('/api/admin/users', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { email, name, role } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const result = await query(
      'INSERT INTO users (email, name, role, invited_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, name || null, role || 'user', admin.email]
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Update / Delete user ──────────────────────────────────
app.patch('/api/admin/users/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { id } = req.params;
  const { active, role, name } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;

  if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(active); }
  if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }

  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(id);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user: result.rows[0] });
});

app.delete('/api/admin/users/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { id } = req.params;
  if (parseInt(id) === admin.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

  const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ deleted: true });
});

// ── Admin: Organizations CRUD ────────────────────────────────────
app.get('/api/admin/organizations', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query(
    `SELECT o.*,
       (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count,
       u.name as created_by_name
     FROM organizations o
     LEFT JOIN users u ON u.id = o.created_by
     ORDER BY o.name`
  );
  res.json({ organizations: result.rows });
});

app.post('/api/admin/organizations', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await query(
      'INSERT INTO organizations (name, created_by) VALUES ($1, $2) RETURNING *',
      [name, admin.id]
    );
    res.json({ organization: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/organizations/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { name, active } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;
  if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
  if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(active); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  const result = await query(
    `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Organización no encontrada' });
  res.json({ organization: result.rows[0] });
});

app.delete('/api/admin/organizations/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query('DELETE FROM organizations WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Organización no encontrada' });
  res.json({ deleted: true });
});

// ── Admin: Organization members ─────────────────────────────────
app.get('/api/admin/organizations/:id/members', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query(
    `SELECT om.*, u.email, u.name, u.avatar_url, u.active as user_active
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1
     ORDER BY om.role, u.name`,
    [req.params.id]
  );
  res.json({ members: result.rows });
});

app.post('/api/admin/organizations/:id/members', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { user_id, role } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    const result = await query(
      'INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, user_id, role || 'alumne']
    );
    res.json({ member: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya es miembro' });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/organizations/:orgId/members/:userId', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: 'role required' });
  const result = await query(
    'UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3 RETURNING *',
    [role, req.params.orgId, req.params.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Miembro no encontrado' });
  res.json({ member: result.rows[0] });
});

app.delete('/api/admin/organizations/:orgId/members/:userId', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query(
    'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2 RETURNING id',
    [req.params.orgId, req.params.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Miembro no encontrado' });
  res.json({ deleted: true });
});

// ── Admin: User organizations (bulk update) ─────────────────────
app.get('/api/admin/users/:id/organizations', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query(
    `SELECT om.organization_id, om.role, o.name
     FROM organization_members om
     JOIN organizations o ON o.id = om.organization_id
     WHERE om.user_id = $1
     ORDER BY o.name`,
    [req.params.id]
  );
  res.json({ organizations: result.rows });
});

app.put('/api/admin/users/:id/organizations', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const userId = req.params.id;
  const { organizations } = req.body; // [{ organization_id, role }]
  if (!Array.isArray(organizations)) return res.status(400).json({ error: 'organizations array required' });

  try {
    // Remove all current memberships
    await query('DELETE FROM organization_members WHERE user_id = $1', [userId]);
    // Insert new ones
    for (const org of organizations) {
      await query(
        'INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)',
        [org.organization_id, userId, org.role || 'alumne']
      );
    }
    const result = await query(
      `SELECT om.organization_id, om.role, o.name
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY o.name`,
      [userId]
    );
    res.json({ organizations: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Formations ───────────────────────────────────────────
app.get('/api/formations', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const result = await query('SELECT * FROM formations WHERE active = true ORDER BY name');
  res.json({ formations: result.rows });
});

app.get('/api/admin/organizations/:id/formations', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query(
    `SELECT f.*
     FROM organization_formations of2
     JOIN formations f ON f.id = of2.formation_id
     WHERE of2.organization_id = $1
     ORDER BY f.name`,
    [req.params.id]
  );
  res.json({ formations: result.rows });
});

app.put('/api/admin/organizations/:id/formations', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const orgId = req.params.id;
  const { formation_ids } = req.body; // [1, 2, 3]
  if (!Array.isArray(formation_ids)) return res.status(400).json({ error: 'formation_ids array required' });

  try {
    await query('DELETE FROM organization_formations WHERE organization_id = $1', [orgId]);
    for (const fId of formation_ids) {
      await query(
        'INSERT INTO organization_formations (organization_id, formation_id) VALUES ($1, $2)',
        [orgId, fId]
      );
    }
    const result = await query(
      `SELECT f.*
       FROM organization_formations of2
       JOIN formations f ON f.id = of2.formation_id
       WHERE of2.organization_id = $1
       ORDER BY f.name`,
      [orgId]
    );
    res.json({ formations: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Proxy to Anthropic API (auth required) ───────────────────────
app.post('/api/messages', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();

    // ── Intercept Anthropic usage ──
    const clientId = req.headers['x-client-id'] || 'unknown';
    if (data.usage) {
      const inp = data.usage.input_tokens || 0;
      const out = data.usage.output_tokens || 0;
      appendUsage({
        service: 'anthropic', clientId, userName: user.name || user.email,
        inputTokens: inp, outputTokens: out,
        model: req.body.model || 'unknown',
        cost: (inp / 1e6) * 3.0 + (out / 1e6) * 15.0
      });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ElevenLabs TTS streaming proxy (auth required) ───────────────
app.post('/api/tts', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  if (!ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ElevenLabs not configured' });
  const { text, voiceId } = req.body;
  if (!text || !voiceId) return res.status(400).json({ error: 'text and voiceId required' });

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_16000`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          language_code: 'es'
        })
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    const reader = response.body.getReader();
    const clientId = req.headers['x-client-id'] || 'unknown';
    let totalBytes = 0;
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        // ── Intercept ElevenLabs usage ──
        const audioDurationSec = totalBytes / 32000; // PCM16 @ 16kHz = 32000 bytes/sec
        appendUsage({
          service: 'elevenlabs', clientId, userName: user.name || user.email,
          characters: text.length, audioDurationSec,
          cost: (text.length / 1000) * 0.15
        });
        res.end();
        return;
      }
      totalBytes += value.length;
      res.write(Buffer.from(value));
      return pump();
    };
    await pump();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── Deepgram temporary token (auth required) ─────────────────────
app.post('/api/tokens', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { type } = req.body;

  if (type === 'deepgram') {
    if (!DEEPGRAM_API_KEY) return res.status(503).json({ error: 'Deepgram not configured' });
    try {
      const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
        method: 'POST',
        headers: {
          'Authorization': `Token ${DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ time_to_live_in_seconds: 120 })
      });
      if (response.ok) {
        const data = await response.json();
        return res.json(data);
      }
      return res.json({ key: DEEPGRAM_API_KEY });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (type === 'simli') {
    if (!SIMLI_API_KEY) return res.status(503).json({ error: 'Simli not configured' });
    const { faceId } = req.body;
    if (!faceId) return res.status(400).json({ error: 'faceId required' });
    try {
      const response = await fetch('https://api.simli.ai/startAudioToVideoSession', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: SIMLI_API_KEY,
          faceId,
          handleSilence: true,
          maxSessionLength: 3600,
          maxIdleTime: 300
        })
      });
      const data = await response.json();
      return res.json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid token type' });
});

// ── Admin: List / Create sessions ─────────────────────────────────
app.get('/api/admin/sessions', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query(
    `SELECT s.*, u.name as created_by_name,
     o.name as organization_name,
     (SELECT COUNT(*) FROM session_participants WHERE session_id = s.id) as participant_count
     FROM sessions s
     JOIN users u ON u.id = s.created_by
     LEFT JOIN organizations o ON o.id = s.organization_id
     ORDER BY s.created_at DESC LIMIT 50`
  );
  res.json({ sessions: result.rows });
});

app.post('/api/admin/sessions', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const duration = parseInt(req.body.duration_min) || 15;
  const orgId = req.body.organization_id || null;
  const formationSlug = req.body.formation_slug || null;
  try {
    const result = await query(
      'INSERT INTO sessions (created_by, duration_min, organization_id, formation_slug) VALUES ($1, $2, $3, $4) RETURNING *',
      [admin.id, duration, orgId, formationSlug]
    );
    res.json({ session: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin: Session actions (GET=ranking, POST=start/stop) ─────────
app.get('/api/admin/sessions/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const sessionResult = await query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
  if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });

  const ranking = await query(
    `SELECT sp.user_id, sp.persona_id, sp.score, sp.completed_items, sp.evaluation,
            sp.joined_at, sp.finished_at, u.name, u.email, u.avatar_url
     FROM session_participants sp JOIN users u ON u.id = sp.user_id
     WHERE sp.session_id = $1
     ORDER BY sp.score DESC, sp.joined_at ASC`,
    [req.params.id]
  );
  res.json({ session: sessionResult.rows[0], ranking: ranking.rows });
});

app.post('/api/admin/sessions/:id', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { action } = req.body || {};

  if (action === 'start') {
    const result = await query(
      `UPDATE sessions SET status = 'active', started_at = NOW()
       WHERE id = $1 AND status = 'created' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Sesión no disponible para iniciar' });
    return res.json({ session: result.rows[0] });
  }

  if (action === 'stop') {
    const result = await query(
      `UPDATE sessions SET status = 'finished', finished_at = NOW()
       WHERE id = $1 AND status = 'active' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Sesión no activa' });
    return res.json({ session: result.rows[0] });
  }

  res.status(400).json({ error: 'action required: start or stop' });
});

// ── User: Get active session ──────────────────────────────────────
app.get('/api/sessions/active', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;

  // Filter sessions by org membership: user sees free sessions (org=NULL) + sessions from their orgs
  const orgIds = (user.organizations || []).map(o => o.id);
  let sessionResult;
  if (orgIds.length > 0) {
    sessionResult = await query(
      `SELECT * FROM sessions WHERE status = 'active'
       AND (organization_id IS NULL OR organization_id = ANY($1))
       ORDER BY started_at DESC LIMIT 1`,
      [orgIds]
    );
  } else {
    sessionResult = await query(
      "SELECT * FROM sessions WHERE status = 'active' AND organization_id IS NULL ORDER BY started_at DESC LIMIT 1"
    );
  }

  if (sessionResult.rows.length === 0) return res.json({ session: null, participation: null });

  const session = sessionResult.rows[0];
  const partResult = await query(
    'SELECT * FROM session_participants WHERE session_id = $1 AND user_id = $2',
    [session.id, user.id]
  );
  res.json({ session, participation: partResult.rows[0] || null });
});

// ── User: Save score ──────────────────────────────────────────────
app.post('/api/sessions/:id', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const { persona_id, score, completed_items, evaluation } = req.body;
  if (!persona_id || score === undefined || !completed_items) {
    return res.status(400).json({ error: 'persona_id, score and completed_items required' });
  }

  const sessionResult = await query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
  if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
  const session = sessionResult.rows[0];
  if (session.status !== 'active' && session.status !== 'finished') {
    return res.status(400).json({ error: 'Sesión no aceptando puntuaciones' });
  }

  try {
    const result = await query(
      `INSERT INTO session_participants (session_id, user_id, persona_id, score, completed_items, evaluation)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id, user_id)
       DO UPDATE SET score = $4, completed_items = $5,
         evaluation = COALESCE($6, session_participants.evaluation),
         persona_id = $3,
         finished_at = CASE WHEN $6 IS NOT NULL THEN NOW() ELSE session_participants.finished_at END
       RETURNING *`,
      [req.params.id, user.id, persona_id, score, completed_items, evaluation || null]
    );
    res.json({ participant: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Monitoring: Heartbeat (auth required) ───────────────────────
app.post('/api/heartbeat', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const clientId = req.headers['x-client-id'];
  if (!clientId) return res.status(400).json({ error: 'X-Client-Id required' });

  const { screen, personaId, personaName, mode: clientMode } = req.body;
  activeClients.set(clientId, {
    connectedAt: activeClients.get(clientId)?.connectedAt || Date.now(),
    lastHeartbeat: Date.now(),
    screen: screen || 'unknown',
    personaId: personaId || null,
    personaName: personaName || null,
    mode: clientMode || null,
    userName: user.name || user.email
  });
  broadcastSSE('clients', [...activeClients.entries()].map(([id, info]) => ({ id: id.slice(0, 5), ...info })));
  res.json({ ok: true });
});

// ── Monitoring: SSE stream (admin required, token via query) ────
app.get('/api/dashboard/stream', async (req, res) => {
  // EventSource doesn't support headers, so accept token via query param
  if (req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  const clients = [...activeClients.entries()].map(([id, info]) => ({ id: id.slice(0, 5), ...info }));
  res.write(`event: clients\ndata: ${JSON.stringify(clients)}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── Monitoring: Client usage report (auth required) ─────────────
app.post('/api/usage/report', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
  const clientId = req.headers['x-client-id'] || 'unknown';
  const { service, ...metrics } = req.body;
  if (!service) return res.status(400).json({ error: 'service required' });

  appendUsage({ service, clientId, userName: user.name || user.email, ...metrics });
  res.json({ ok: true });
});

// ── Monitoring: Usage data (admin required) ─────────────────────
app.get('/api/dashboard/usage', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const events = loadUsage();
  const from = req.query.from || null;
  const summary = computeSummary(events, from);
  const recent = events.slice(-50).reverse();
  res.json({ summary, recent, total: events.length });
});

// ── Monitoring: Active clients (admin required, non-SSE) ────────
app.get('/api/dashboard/clients', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const clients = [...activeClients.entries()].map(([id, info]) => ({ id: id.slice(0, 5), ...info }));
  res.json({ clients });
});

// ── Serve built frontend ────────────────────────────────────────
const distPath = join(__dirname, 'dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  const saas = ELEVENLABS_API_KEY && DEEPGRAM_API_KEY && SIMLI_API_KEY;
  console.log(`
🎭 Simulador de Toma de Requerimientos
   ────────────────────────────────────
   ✅ Servidor activo en: http://localhost:${PORT}
   🔑 Claude: ${API_KEY.slice(0, 12)}...
   🗄️  Database: ${process.env.DATABASE_URL ? 'Conectada' : '⚠️ No configurada'}
   ${saas ? '🎙️ Mode SaaS: Simli + ElevenLabs + Deepgram' : '⚠️  Mode fallback: Web Speech API + SVG avatars'}
`);
});
