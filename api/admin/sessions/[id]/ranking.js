import { requireAdmin } from '../../../../lib/auth.js';
import { query } from '../../../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.query;
  const sessionResult = await query('SELECT * FROM sessions WHERE id = $1', [id]);
  if (sessionResult.rows.length === 0) return res.status(404).json({ error: 'Sesión no encontrada' });

  const ranking = await query(
    `SELECT sp.user_id, sp.persona_id, sp.score, sp.completed_items, sp.evaluation,
            sp.joined_at, sp.finished_at, u.name, u.email, u.avatar_url
     FROM session_participants sp JOIN users u ON u.id = sp.user_id
     WHERE sp.session_id = $1
     ORDER BY sp.score DESC, sp.joined_at ASC`,
    [id]
  );
  res.json({ session: sessionResult.rows[0], ranking: ranking.rows });
}
