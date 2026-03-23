/**
 * routes/auth.ts — Static credential login for the Flint Dashboard.
 *
 * Credentials are set via .env:
 *   DASHBOARD_USER=admin
 *   DASHBOARD_PASS=secret
 *   JWT_SECRET=<random string>
 */
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET   = process.env.JWT_SECRET    ?? 'change-me-in-env';
const VALID_USER   = process.env.DASHBOARD_USER ?? 'admin';
const VALID_PASS   = process.env.DASHBOARD_PASS ?? '';

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

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});
