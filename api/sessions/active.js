import { requireAuth } from '../../lib/auth.js';
import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const sessionResult = await query(
    "SELECT * FROM sessions WHERE status = 'active' ORDER BY started_at DESC LIMIT 1"
  );
  if (sessionResult.rows.length === 0) return res.json({ session: null, participation: null });

  const session = sessionResult.rows[0];
  const partResult = await query(
    'SELECT * FROM session_participants WHERE session_id = $1 AND user_id = $2',
    [session.id, user.id]
  );
  res.json({ session, participation: partResult.rows[0] || null });
}
