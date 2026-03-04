import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { query } from './db.js';

const googleClient = new OAuth2Client();

export async function verifyGoogleToken(idToken, clientId) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  return {
    email: payload.email,
    name: payload.name,
    avatar_url: payload.picture,
  };
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function verifyAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows[0];
    if (!user || !user.active) return null;

    // Load organization memberships
    const orgsResult = await query(
      `SELECT o.id, o.name, om.role
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1 AND o.active = true
       ORDER BY o.name`,
      [user.id]
    );
    user.organizations = orgsResult.rows;

    return user;
  } catch {
    return null;
  }
}

export async function checkOrgRole(userId, orgId) {
  const result = await query(
    'SELECT role FROM organization_members WHERE user_id = $1 AND organization_id = $2',
    [userId, orgId]
  );
  return result.rows[0]?.role || null;
}

export async function requireAuth(req, res) {
  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: 'No autorizado' });
    return null;
  }
  return user;
}

export async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (user && user.role !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado' });
    return null;
  }
  return user;
}
