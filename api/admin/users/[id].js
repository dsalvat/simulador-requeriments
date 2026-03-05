import { requireAdmin } from '../../../lib/auth.js';
import { query } from '../../../lib/db.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id, sub } = req.query;

  // GET /api/admin/users/:id/organizations (via rewrite with ?sub=organizations)
  if (sub === 'organizations' && req.method === 'GET') {
    const result = await query(
      `SELECT om.organization_id, om.role, o.name
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY o.name`,
      [id]
    );
    return res.json({ organizations: result.rows });
  }

  // PUT /api/admin/users/:id/organizations (via rewrite with ?sub=organizations)
  if (sub === 'organizations' && req.method === 'PUT') {
    const { organizations } = req.body;
    if (!Array.isArray(organizations)) return res.status(400).json({ error: 'organizations array required' });
    try {
      await query('DELETE FROM organization_members WHERE user_id = $1', [id]);
      for (const org of organizations) {
        await query(
          'INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)',
          [org.organization_id, id, org.role || 'alumne']
        );
      }
      const result = await query(
        `SELECT om.organization_id, om.role, o.name
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = $1
         ORDER BY o.name`,
        [id]
      );
      return res.json({ organizations: result.rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    const { active, role, name } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;

    if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(active); }
    if (role !== undefined) { fields.push(`role = $${idx++}`); values.push(role); }
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(id);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json({ user: result.rows[0] });
  }

  if (req.method === 'DELETE') {
    if (parseInt(id) === admin.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    return res.json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
