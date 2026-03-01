import { requireAuth } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireAuth(req, res);
  if (!user) return;

  res.json({
    user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url, role: user.role }
  });
}
