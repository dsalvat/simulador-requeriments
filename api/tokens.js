import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const { type } = req.body;

  if (type === 'deepgram') {
    const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
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
    const SIMLI_API_KEY = process.env.SIMLI_API_KEY;
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

  return res.status(400).json({ error: 'Invalid token type. Use "deepgram" or "simli"' });
}
