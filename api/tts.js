import { requireAuth } from '../lib/auth.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
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
}
