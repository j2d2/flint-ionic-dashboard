/**
 * routes/haikus.ts — Haiku Leaderboard REST endpoints.
 *
 * All data proxied through Flint MCP (haiku.db, managed by haiku_leaderboard.py).
 * No direct SQLite access in this process.
 *
 * Routes:
 *   GET  /api/haikus           — list leaderboard, sorted by votes (or ?sort=newest)
 *   GET  /api/haikus/pair      — get 2 un-voted haikus for a voter (?voter_id=...)
 *   POST /api/haikus/:id/vote  — cast a vote { voter_id, chore_id? }
 */
import { Router } from 'express';
import * as flint from '../services/flintMcp';

export const haikusRouter = Router();

// GET /api/haikus?sort=votes|newest&limit=20&offset=0
haikusRouter.get('/', async (req, res) => {
  try {
    const sort = req.query['sort'] === 'newest' ? 'newest' : 'votes';
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10) || 20));
    const offset = Math.max(0, parseInt(String(req.query['offset'] ?? '0'), 10) || 0);
    const result = await flint.listHaikus(limit, sort, offset);
    res.json(result);
  } catch (err) {
    console.error('[haikus] list failed:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/haikus/pair?voter_id=Alice
haikusRouter.get('/pair', async (req, res) => {
  try {
    const voterId = String(req.query['voter_id'] ?? '').trim();
    if (!voterId) {
      res.status(400).json({ error: 'voter_id query param is required' });
      return;
    }
    const result = await flint.getHaikuPair(voterId);
    res.json(result);
  } catch (err) {
    console.error('[haikus] pair failed:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/haikus/:id/vote  body: { voter_id: string, chore_id?: string }
haikusRouter.post('/:id/vote', async (req, res) => {
  try {
    const haikuId = req.params['id'];
    const { voter_id, chore_id } = req.body as { voter_id?: string; chore_id?: string };
    if (!voter_id?.trim()) {
      res.status(400).json({ error: 'voter_id is required in request body' });
      return;
    }
    const result = await flint.voteHaiku(haikuId, voter_id.trim(), chore_id);
    res.json(result);
  } catch (err) {
    console.error('[haikus] vote failed:', (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});
