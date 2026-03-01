import { requireAuth } from '../../../lib/auth.js';
import { query } from '../../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  const { persona_id, score, completed_items, evaluation } = req.body;
  if (!persona_id || score === undefined || !completed_items) {
    return res.status(400).json({ error: 'persona_id, score and completed_items required' });
  }

  const sessionResult = await query('SELECT * FROM sessions WHERE id = $1', [id]);
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
      [id, user.id, persona_id, score, completed_items, evaluation || null]
    );
    return res.json({ participant: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
