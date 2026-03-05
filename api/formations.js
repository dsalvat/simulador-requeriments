import { requireAuth } from '../lib/auth.js';
import { query } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Also handles /api/services-status via rewrite (?action=services-status)
  if (req.query.action === 'services-status') {
    return res.json({
      claude: !!process.env.ANTHROPIC_API_KEY,
      elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      deepgram: !!process.env.DEEPGRAM_API_KEY,
      simli: !!process.env.SIMLI_API_KEY,
      saasReady: !!(process.env.ELEVENLABS_API_KEY && process.env.DEEPGRAM_API_KEY && process.env.SIMLI_API_KEY)
    });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const result = await query('SELECT * FROM formations WHERE active = true ORDER BY name');
  res.json({ formations: result.rows });
}
