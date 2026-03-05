import { requireAdmin } from '../../lib/auth.js';
import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id, sub, uid } = req.query;
  const method = req.method;

  // GET /api/admin/organizations — list all
  if (!id && method === 'GET') {
    const result = await query(
      `SELECT o.*,
         (SELECT COUNT(*) FROM organization_members WHERE organization_id = o.id) as member_count,
         u.name as created_by_name
       FROM organizations o
       LEFT JOIN users u ON u.id = o.created_by
       ORDER BY o.name`
    );
    return res.json({ organizations: result.rows });
  }

  // POST /api/admin/organizations — create
  if (!id && method === 'POST') {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
      const result = await query(
        'INSERT INTO organizations (name, created_by) VALUES ($1, $2) RETURNING *',
        [name, admin.id]
      );
      return res.json({ organization: result.rows[0] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (!id) return res.status(405).json({ error: 'Method not allowed' });

  // ── Members ──────────────────────────────────────────────────────
  if (sub === 'members') {
    if (method === 'GET') {
      const result = await query(
        `SELECT om.*, u.email, u.name, u.avatar_url, u.active as user_active
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
         WHERE om.organization_id = $1
         ORDER BY om.role, u.name`,
        [id]
      );
      return res.json({ members: result.rows });
    }
    if (method === 'POST') {
      const { user_id, role } = req.body;
      if (!user_id) return res.status(400).json({ error: 'user_id required' });
      try {
        const result = await query(
          'INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3) RETURNING *',
          [id, user_id, role || 'alumne']
        );
        return res.json({ member: result.rows[0] });
      } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'El usuario ya es miembro' });
        return res.status(500).json({ error: err.message });
      }
    }
    if (uid && method === 'PATCH') {
      const { role } = req.body;
      if (!role) return res.status(400).json({ error: 'role required' });
      const result = await query(
        'UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3 RETURNING *',
        [role, id, uid]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Miembro no encontrado' });
      return res.json({ member: result.rows[0] });
    }
    if (uid && method === 'DELETE') {
      const result = await query(
        'DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2 RETURNING id',
        [id, uid]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Miembro no encontrado' });
      return res.json({ deleted: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Formations ───────────────────────────────────────────────────
  if (sub === 'formations') {
    if (method === 'GET') {
      const result = await query(
        `SELECT f.*
         FROM organization_formations of2
         JOIN formations f ON f.id = of2.formation_id
         WHERE of2.organization_id = $1
         ORDER BY f.name`,
        [id]
      );
      return res.json({ formations: result.rows });
    }
    if (method === 'PUT') {
      const { formation_ids } = req.body;
      if (!Array.isArray(formation_ids)) return res.status(400).json({ error: 'formation_ids array required' });
      try {
        await query('DELETE FROM organization_formations WHERE organization_id = $1', [id]);
        for (const fId of formation_ids) {
          await query(
            'INSERT INTO organization_formations (organization_id, formation_id) VALUES ($1, $2)',
            [id, fId]
          );
        }
        const result = await query(
          `SELECT f.*
           FROM organization_formations of2
           JOIN formations f ON f.id = of2.formation_id
           WHERE of2.organization_id = $1
           ORDER BY f.name`,
          [id]
        );
        return res.json({ formations: result.rows });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Org by ID (no sub) ──────────────────────────────────────────
  if (method === 'PATCH') {
    const { name, active } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (active !== undefined) { fields.push(`active = $${idx++}`); values.push(active); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(id);
    const result = await query(
      `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Organizacion no encontrada' });
    return res.json({ organization: result.rows[0] });
  }

  if (method === 'DELETE') {
    const result = await query('DELETE FROM organizations WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Organizacion no encontrada' });
    return res.json({ deleted: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
