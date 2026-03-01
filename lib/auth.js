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
    return user;
  } catch {
    return null;
  }
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
