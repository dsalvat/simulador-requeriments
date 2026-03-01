import { requireAdmin } from '../../lib/auth.js';
import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') {
    const result = await query(
      'SELECT id, email, name, avatar_url, role, active, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    return res.json({ users: result.rows });
  }

  if (req.method === 'POST') {
    const { email, name, role } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    try {
      const result = await query(
        'INSERT INTO users (email, name, role, invited_by) VALUES ($1, $2, $3, $4) RETURNING *',
        [email, name || null, role || 'user', admin.email]
      );
      return res.json({ user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya existe' });
      throw err;
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
