import { requireAuth } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const SIMLI_API_KEY = process.env.SIMLI_API_KEY;
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
}
