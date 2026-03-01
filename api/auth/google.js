import { verifyGoogleToken, signToken } from '../../lib/auth.js';
import { query } from '../../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const googleUser = await verifyGoogleToken(token, process.env.GOOGLE_CLIENT_ID);

    const result = await query('SELECT * FROM users WHERE email = $1', [googleUser.email]);
    let user = result.rows[0];

    if (!user) {
      return res.status(403).json({ error: 'not_registered' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'deactivated' });
    }

    const updated = await query(
      `UPDATE users SET name = COALESCE($1, name), avatar_url = COALESCE($2, avatar_url),
       last_login = NOW() WHERE id = $3 RETURNING *`,
      [googleUser.name, googleUser.avatar_url, user.id]
    );
    user = updated.rows[0];

    const appToken = signToken(user);
    return res.json({
      token: appToken,
      user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, role: user.role }
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(500).json({ error: 'Error de autenticación' });
  }
}
