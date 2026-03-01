import { requireAdmin } from '../../../lib/auth.js';
import { query } from '../../../lib/db.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.query;

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
