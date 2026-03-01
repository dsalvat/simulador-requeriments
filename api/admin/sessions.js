import { requireAdmin } from '../../lib/auth.js';
import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') {
    const result = await query(
      `SELECT s.*, u.name as created_by_name,
       (SELECT COUNT(*) FROM session_participants WHERE session_id = s.id) as participant_count
       FROM sessions s JOIN users u ON u.id = s.created_by
       ORDER BY s.created_at DESC LIMIT 50`
    );
    return res.json({ sessions: result.rows });
  }

  if (req.method === 'POST') {
    const duration = parseInt(req.body.duration_min) || 15;
    try {
      const result = await query(
        'INSERT INTO sessions (created_by, duration_min) VALUES ($1, $2) RETURNING *',
        [admin.id, duration]
      );
      return res.json({ session: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
