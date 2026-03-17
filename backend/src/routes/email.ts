/**
 * routes/email.ts — Inbox summary endpoint.
 *
 * GET /api/email/summary?limit=20&source=all&refresh=true
 *   → Spawns email_fetch.py, returns JSON with accounts + messages.
 *   → Cached for 60 seconds to avoid hammering Gmail/Outlook APIs.
 */
import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';

export const emailRouter = Router();

// ---------------------------------------------------------------------------
// Paths — resolve from __dirname so they work with both ts-node-dev and dist/
//   email.ts lives at: apps/flint-ionic-dashboard/backend/src/routes/
//   root is 5 levels up: routes/ → src/ → backend/ → flint-ionic-dashboard/ → apps/ → openclaw-instance/
// ---------------------------------------------------------------------------
const OPENCLAW_ROOT = path.resolve(__dirname, '../../../../../');
const PYTHON = process.env['EMAIL_FETCH_PYTHON']
  ?? path.join(OPENCLAW_ROOT, 'projects/openclaw-mcp/.venv/bin/python');
const SCRIPT = process.env['EMAIL_FETCH_SCRIPT']
  ?? path.join(OPENCLAW_ROOT, 'projects/openclaw-mcp/scripts/email_fetch.py');

// ---------------------------------------------------------------------------
// Simple in-process TTL cache
// ---------------------------------------------------------------------------
interface CacheEntry {
  data: unknown;
  ts: number;
  source: string;
  limit: number;
}

const CACHE_TTL_MS = 60_000; // 60 seconds
const _cache = new Map<string, CacheEntry>(); // key: "source:limit"

function cacheKey(source: string, limit: number): string {
  return `${source}:${limit}`;
}

// ---------------------------------------------------------------------------
// GET /api/email/summary
// ---------------------------------------------------------------------------
emailRouter.get('/summary', async (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query['limit'] ?? '20'), 10)));
  const source = ['all', 'gmail', 'outlook'].includes(String(req.query['source']))
    ? String(req.query['source'])
    : 'all';
  const forceRefresh = req.query['refresh'] === 'true';

  const key = cacheKey(source, limit);
  const cached = _cache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    const cacheAge = Math.round((Date.now() - cached.ts) / 1000);
    res.json(Object.assign({}, cached.data as object, { _cached: true, _cache_age_s: cacheAge }));
    return;
  }

  try {
    const data = await runEmailFetch(limit, source);
    _cache.set(key, { data, ts: Date.now(), source, limit });
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[email] fetch error:', msg);
    res.status(500).json({ error: msg, accounts: [], errors: [msg] });
  }
});

// ---------------------------------------------------------------------------
// GET /api/email/accounts — lightweight: just names + source, no messages
// ---------------------------------------------------------------------------
emailRouter.get('/accounts', async (_req: Request, res: Response) => {
  const cached = _cache.get(cacheKey('all', 20));
  if (cached) {
    const summary = (cached.data as { accounts?: Array<{ source: string; account: string; unread_count: number }> }).accounts?.map(
      (a) => ({ source: a.source, account: a.account, unread_count: a.unread_count })
    ) ?? [];
    res.json({ accounts: summary });
    return;
  }
  res.json({ accounts: [] });
});

// ---------------------------------------------------------------------------
// Spawn helper
// ---------------------------------------------------------------------------
function runEmailFetch(limit: number, source: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [SCRIPT, '--limit', String(limit), '--source', source]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('email_fetch.py timed out after 30 seconds'));
    }, 30_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`email_fetch.py exited with code ${code}: ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse JSON from email_fetch.py: ${stdout.slice(0, 300)}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn email_fetch.py: ${err.message}\nPYTHON=${PYTHON}\nSCRIPT=${SCRIPT}`));
    });
  });
}
