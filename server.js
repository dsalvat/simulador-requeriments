import express from 'express';
import cors from 'cors';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// ── Services status ──────────────────────────────────────────────
app.get('/api/services-status', (req, res) => {
  res.json({
    claude: !!API_KEY,
    elevenlabs: !!ELEVENLABS_API_KEY,
    deepgram: !!DEEPGRAM_API_KEY,
    simli: !!SIMLI_API_KEY,
    saasReady: !!(ELEVENLABS_API_KEY && DEEPGRAM_API_KEY && SIMLI_API_KEY)
  });
});

// ── Proxy to Anthropic API ───────────────────────────────────────
app.post('/api/messages', async (req, res) => {
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

// ── ElevenLabs TTS streaming proxy ──────────────────────────────
app.post('/api/tts', async (req, res) => {
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

// ── Deepgram temporary token ────────────────────────────────────
app.post('/api/deepgram-token', async (req, res) => {
  if (!DEEPGRAM_API_KEY) return res.status(503).json({ error: 'Deepgram not configured' });
  try {
    // Try to get a temporary token first (requires keys:write permission)
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
    // Fallback: return the API key directly for WebSocket auth
    res.json({ key: DEEPGRAM_API_KEY });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Simli session token ─────────────────────────────────────────
app.post('/api/simli-token', async (req, res) => {
  if (!SIMLI_API_KEY) return res.status(503).json({ error: 'Simli not configured' });
  const { faceId } = req.body;
  if (!faceId) return res.status(400).json({ error: 'faceId required' });
  try {
    const response = await fetch('https://api.simli.ai/startAudioToVideoSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
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
🎭 Simulador de Presa de Requeriments
   ────────────────────────────────────
   ✅ Servidor actiu a: http://localhost:${PORT}
   🔑 Claude: ${API_KEY.slice(0, 12)}...
   ${saas ? '🎙️ Mode SaaS: Simli + ElevenLabs + Deepgram' : '⚠️  Mode fallback: Web Speech API + SVG avatars'}

   Obre http://localhost:${PORT} al navegador (Chrome recomanat).
`);
});
