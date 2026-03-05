import { requireAdmin } from '../../lib/auth.js';
import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.active, u.created_at, u.last_login,
         COALESCE(
           (SELECT json_agg(json_build_object('org_id', o.id, 'org_name', o.name, 'role', om.role))
            FROM organization_members om
            JOIN organizations o ON o.id = om.organization_id
            WHERE om.user_id = u.id), '[]'
         ) as organizations
       FROM users u ORDER BY u.created_at DESC`
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
