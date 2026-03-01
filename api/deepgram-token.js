import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

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
    // Fallback: return the API key directly for WebSocket auth
    res.json({ key: DEEPGRAM_API_KEY });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
