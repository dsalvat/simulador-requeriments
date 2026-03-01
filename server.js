import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { verifyGoogleToken, signToken, requireAuth, requireAdmin } from './lib/auth.js';
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

    const appToken = signToken(user);
    res.json({
      token: appToken,
      user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, role: user.role }
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
    user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, role: user.role }
  });
});

// ── Admin: List / Create users ───────────────────────────────────
app.get('/api/admin/users', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const result = await query(
    'SELECT id, email, name, avatar_url, role, active, created_at, last_login FROM users ORDER BY created_at DESC'
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
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) { res.end(); return; }
      res.write(Buffer.from(value));
      return pump();
    };
    await pump();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ── Deepgram temporary token (auth required) ─────────────────────
app.post('/api/deepgram-token', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
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
    res.json({ key: DEEPGRAM_API_KEY });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Simli session token (auth required) ──────────────────────────
app.post('/api/simli-token', async (req, res) => {
  const user = await requireAuth(req, res);
  if (!user) return;
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
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
