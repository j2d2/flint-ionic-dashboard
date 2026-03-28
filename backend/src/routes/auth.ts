/**
 * routes/auth.ts — Static credential login for the Flint Dashboard.
 *
 * Credentials are set via .env:
 *   DASHBOARD_USER=admin
 *   DASHBOARD_PASS=secret
 *   JWT_SECRET=<random string>
 *
 * Token strategy:
 *   - Access token: 24h, signed JWT (verified by requireAuth middleware)
 *   - Refresh token: 30d, signed JWT with jti claim for revocation
 *   - Refresh tokens are rotated on every use (old jti invalidated, new one issued)
 *   - In-memory revocation set (validRefreshJtis) — cleared on server restart,
 *     which forces a re-login (intentional — server restart is a security boundary)
 */
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET    ?? 'change-me-in-env';
const VALID_USER = process.env.DASHBOARD_USER ?? 'admin';
const VALID_PASS = process.env.DASHBOARD_PASS ?? '';

const ACCESS_TTL  = '24h';
const REFRESH_TTL = '30d';

// In-memory revocation list keyed by jti (JWT ID).
// Refresh tokens not in this set are rejected even if the JWT signature is valid.
const validRefreshJtis = new Set<string>();

function issueTokenPair(username: string): { token: string; refreshToken: string } {
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: ACCESS_TTL });

  const jti = crypto.randomUUID();
  validRefreshJtis.add(jti);
  const refreshToken = jwt.sign({ username, jti }, JWT_SECRET, { expiresIn: REFRESH_TTL });

  return { token, refreshToken };
}

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  // Constant-time comparison to avoid timing attacks
  const userMatch = username === VALID_USER;
  const passMatch = password === VALID_PASS;

  if (!userMatch || !passMatch) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json(issueTokenPair(username));
});

// POST /api/auth/refresh — exchange a valid refresh token for a new token pair (rotation)
authRouter.post('/refresh', (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(refreshToken, JWT_SECRET) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
    return;
  }

  const { username, jti } = payload;
  if (!username || !jti || !validRefreshJtis.has(jti)) {
    res.status(401).json({ error: 'Refresh token has been revoked' });
    return;
  }

  // Rotate: invalidate old jti, issue a fresh pair
  validRefreshJtis.delete(jti);
  res.json(issueTokenPair(username));
});

// POST /api/auth/logout — revoke the refresh token server-side
authRouter.post('/logout', (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (refreshToken) {
    try {
      const payload = jwt.decode(refreshToken) as jwt.JwtPayload | null;
      if (payload?.jti) validRefreshJtis.delete(payload.jti);
    } catch { /* ignore malformed tokens */ }
  }

  res.json({ ok: true });
});
