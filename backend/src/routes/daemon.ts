/**
 * routes/daemon.ts — Flint daemon status + survey-plan management.
 *
 * Endpoints:
 *   GET  /api/daemon/status        — is the daemon running? heartbeat age?
 *   GET  /api/daemon/plan          — current survey-plan.json (sans raw response)
 *   POST /api/daemon/plan/approve  — approve pending plan (flint d approve)
 *   POST /api/daemon/plan/reject   — reject plan, queue re-survey (flint d reject)
 */
import { Router, Request, Response } from 'express';
import { exec, spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export const daemonRouter = Router();

// ---------------------------------------------------------------------------
// File paths — mirrors scripts/flint DAEMON_PID_FILE + DAEMON_LOG_FILE
// ---------------------------------------------------------------------------
const HOME = os.homedir();
const MCP_DIR = process.env.MCP_DIR
  ?? path.join(HOME, 'Documents/ai-ml/openclaw-instance/projects/openclaw-mcp');

const DAEMON_PID_FILE   = path.join(MCP_DIR, '.daemon.pid');
const DAEMON_LOG_FILE   = path.join(MCP_DIR, 'daemon.log');
const SURVEY_PLAN_FILE  = path.join(HOME, '.openclaw', 'survey-plan.json');
const HEARTBEAT_FILE    = path.join(HOME, '.openclaw', 'daemon.heartbeat');

// ---------------------------------------------------------------------------
// GET /api/daemon/status
// ---------------------------------------------------------------------------
daemonRouter.get('/status', async (_req: Request, res: Response) => {
  try {
    let pid: number | null = null;
    let is_running = false;

    // PID file check
    try {
      const pidStr = await readFile(DAEMON_PID_FILE, 'utf8');
      pid = parseInt(pidStr.trim(), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0);        // throws ESRCH if dead, EPERM if alive but no perms
          is_running = true;
        } catch (e: any) {
          is_running = e.code === 'EPERM'; // EPERM = process exists, just can't signal it
        }
      }
    } catch { /* no PID file — daemon not started */ }

    // Heartbeat file check
    let heartbeat_ts: number | null = null;
    let heartbeat_age_seconds: number | null = null;
    try {
      const hbContent = await readFile(HEARTBEAT_FILE, 'utf8');
      heartbeat_ts = parseFloat(hbContent.trim());
      heartbeat_age_seconds = Math.round(Date.now() / 1000 - heartbeat_ts);
    } catch { /* no heartbeat yet */ }

    res.json({ is_running, pid, heartbeat_ts, heartbeat_age_seconds });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/daemon/plan
// ---------------------------------------------------------------------------
daemonRouter.get('/plan', async (_req: Request, res: Response) => {
  try {
    const raw = await readFile(SURVEY_PLAN_FILE, 'utf8');
    const plan = JSON.parse(raw);
    // Omit heavy debug fields — frontend doesn't need them
    const { raw_claude_response, claude_snippet, tool_log, ...rest } = plan;
    res.json(rest);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'No survey plan found. Run: flint d survey' });
    } else {
      res.status(500).json({ error: String(err) });
    }
  }
});

// ---------------------------------------------------------------------------
// POST /api/daemon/plan/approve
// ---------------------------------------------------------------------------
daemonRouter.post('/plan/approve', async (_req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await execAsync('flint d approve');
    res.json({ ok: true, output: (stdout + stderr).trim() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/daemon/plan/reject
// ---------------------------------------------------------------------------
daemonRouter.post('/plan/reject', async (_req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await execAsync('flint d reject');
    res.json({ ok: true, output: (stdout + stderr).trim() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/daemon/start
// ---------------------------------------------------------------------------
daemonRouter.post('/start', async (_req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await execAsync('flint d start');
    res.json({ ok: true, output: (stdout + stderr).trim() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/daemon/stop
// ---------------------------------------------------------------------------
daemonRouter.post('/stop', async (_req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await execAsync('flint d stop');
    res.json({ ok: true, output: (stdout + stderr).trim() });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/daemon/survey  — kick off survey-force (fire-and-forget, ~60s)
// ---------------------------------------------------------------------------
daemonRouter.post('/survey', (_req: Request, res: Response) => {
  // Fire-and-forget: survey writes ~/.openclaw/survey-plan.json when done
  execAsync('flint d survey-force').catch(() => {});
  res.json({ ok: true, output: 'Survey started. Poll /api/daemon/plan in ~60s for results.' });
});

// ---------------------------------------------------------------------------
// GET /api/daemon/logs  — SSE stream of daemon.log (auth via ?token= query param)
// ---------------------------------------------------------------------------
daemonRouter.get('/logs', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const tail = spawn('tail', ['-n', '100', '-f', DAEMON_LOG_FILE]);

  tail.stdout.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (line.trim()) {
        res.write(`data: ${JSON.stringify(line)}\n\n`);
      }
    }
  });

  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20_000);

  const cleanup = () => { clearInterval(heartbeat); tail.kill(); };
  req.on('close', cleanup);
  tail.on('error', () => { cleanup(); res.end(); });
});
