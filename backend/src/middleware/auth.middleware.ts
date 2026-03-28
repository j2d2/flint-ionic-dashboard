import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-env';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Support both Authorization header (normal requests) and ?token= query param (EventSource/SSE)
  const header = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized — no token' });
    return;
  }
  try {
    (req as Request & { user: unknown }).user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }
}
