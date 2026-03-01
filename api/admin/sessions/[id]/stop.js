import { requireAdmin } from '../../../../lib/auth.js';
import { query } from '../../../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.query;
  const result = await query(
    `UPDATE sessions SET status = 'finished', finished_at = NOW()
     WHERE id = $1 AND status = 'active' RETURNING *`,
    [id]
  );
  if (result.rows.length === 0) return res.status(400).json({ error: 'Sesión no activa' });
  res.json({ session: result.rows[0] });
}
