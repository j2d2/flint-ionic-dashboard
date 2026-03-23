/**
 * routes/thread-builder.ts — Iterative thread builder.
 *
 * Users build a thread turn-by-turn (oldest → newest).
 * Each "Add Turn" appends to the vault note immediately (crash-safe).
 * "Finalize" marks the note complete.
 *
 * Phase 1: start / turn / finalize
 * Phase 2: get (resume) / list
 *
 * Routes:
 *   POST /api/thread-builder/start           → { thread_id, vault_path }
 *   POST /api/thread-builder/:id/turn        → { turn_id, turn_number, turn_count }
 *   POST /api/thread-builder/:id/finalize    → { vault_path, status, turn_count }
 *   POST /api/thread-builder/:id/fork        → { thread_id, vault_path, title } (Phase 3 fork)
 *   GET  /api/thread-builder/:id             → { meta, turns }  (Phase 2 resume)
 *   GET  /api/thread-builder                 → ThreadMeta[]     (Phase 2 list)
 */
import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import * as path from 'path';
import { addToVault, readVaultFile, listVaultDirectory } from '../services/flintMcp';

export const threadBuilderRouter = Router();

// ─── Constants ───────────────────────────────────────────────────────────────

const VAULT_ROOT = '/Users/jd/Documents/ai-ml/openclaw-instance/projects/obsidian-vault';
const THREADS_FOLDER = 'Threads';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BuilderTurn {
  turn_id: string;
  turn_number: number;
  branch: string;
  timestamp: string;
  prompt: string;
  response: string;
}

export interface ThreadMeta {
  thread_id: string;
  vault_path: string;   // relative: Threads/thread-YYYYMMDD-HHMMSS-xxxx.md
  title: string;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'complete';
  turn_count: number;
  forked_from?: string;        // thread_id of parent
  forked_from_turn?: number;   // turn number where fork branched
}

// ─── In-memory registry (thread_id → relative vault_path) ────────────────────
// Survives for the lifetime of this server process.
// If the server restarts, GET /:id falls back to vault scan.
const registry = new Map<string, string>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateThreadId(): string {
  return `thr_${randomBytes(6).toString('hex')}`;
}

function generateVaultFilename(now = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const date = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const suffix = randomBytes(2).toString('hex');
  return `thread-${date}-${time}-${suffix}.md`;
}

function renderTurnBlock(turn: BuilderTurn): string {
  return [
    `## Turn ${turn.turn_number}`,
    `<!-- turn_id: ${turn.turn_id} | timestamp: ${turn.timestamp} | branch: ${turn.branch} -->`,
    ``,
    `**User:** ${turn.prompt}`,
    ``,
    `**Assistant:** ${turn.response}`,
    ``,
    `---`,
    ``,
  ].join('\n');
}

function buildFullNote(meta: ThreadMeta, turns: BuilderTurn[]): string {
  const forkLines = meta.forked_from
    ? [`forked_from: ${meta.forked_from}`, `forked_from_turn: ${meta.forked_from_turn ?? 0}`]
    : [];

  const fm = [
    `---`,
    `thread_id: ${meta.thread_id}`,
    `title: "${meta.title}"`,
    `created_at: ${meta.created_at}`,
    `updated_at: ${meta.updated_at}`,
    `status: ${meta.status}`,
    `turn_count: ${meta.turn_count}`,
    ...forkLines,
    `tags: [thread, iterative-build]`,
    `---`,
    ``,
    `# ${meta.title}`,
    ``,
  ].join('\n');

  return fm + turns.map(renderTurnBlock).join('\n');
}

function parseFrontmatterField(fmRaw: string, key: string): string {
  const m = fmRaw.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return m ? m[1].trim() : '';
}

function parseThreadNote(content: string, relPath = ''): { meta: ThreadMeta; turns: BuilderTurn[] } {
  // --- frontmatter ---
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const fmRaw = fmMatch ? fmMatch[1] : '';

  const meta: ThreadMeta = {
    thread_id: parseFrontmatterField(fmRaw, 'thread_id'),
    vault_path: relPath,
    title: parseFrontmatterField(fmRaw, 'title'),
    created_at: parseFrontmatterField(fmRaw, 'created_at'),
    updated_at: parseFrontmatterField(fmRaw, 'updated_at'),
    status: (parseFrontmatterField(fmRaw, 'status') as 'draft' | 'complete') || 'draft',
    turn_count: parseInt(parseFrontmatterField(fmRaw, 'turn_count') || '0', 10),
    forked_from: parseFrontmatterField(fmRaw, 'forked_from') || undefined,
    forked_from_turn: parseInt(parseFrontmatterField(fmRaw, 'forked_from_turn') || '0', 10) || undefined,
  };

  // --- turns ---
  const TURN_RE =
    /## Turn (\d+)\n<!-- turn_id: ([^\s|]+) \| timestamp: ([^\s|]+) \| branch: ([^\s-]+) -->\n\n\*\*User:\*\* ([\s\S]*?)\n\n\*\*Assistant:\*\* ([\s\S]*?)\n\n---/g;

  const turns: BuilderTurn[] = [];
  let m: RegExpExecArray | null;
  while ((m = TURN_RE.exec(content)) !== null) {
    turns.push({
      turn_number: parseInt(m[1], 10),
      turn_id: m[2],
      timestamp: m[3],
      branch: m[4],
      prompt: m[5].trim(),
      response: m[6].trim(),
    });
  }

  meta.turn_count = turns.length;
  return { meta, turns };
}

/** Scan Threads/ folder to find a note matching the given thread_id. */
async function findVaultPathById(threadId: string): Promise<string | null> {
  const absFolder = path.join(VAULT_ROOT, THREADS_FOLDER);
  try {
    const dir = await listVaultDirectory(absFolder);
    const mdFiles = dir.entries.filter(e => e.name.endsWith('.md'));
    for (const entry of mdFiles) {
      const relPath = `${THREADS_FOLDER}/${entry.name}`;
      const absPath = path.join(VAULT_ROOT, relPath);
      try {
        const content = await readVaultFile(absPath);
        if (content.includes(`thread_id: ${threadId}`)) {
          return relPath;
        }
      } catch { /* skip unreadable file */ }
    }
  } catch { /* folder not found */ }
  return null;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/thread-builder/start
 * Body: { title?: string }
 * Creates empty vault note, returns thread_id + vault_path.
 */
threadBuilderRouter.post('/start', async (req: Request, res: Response) => {
  try {
    const title: string = req.body?.title?.trim() || 'Untitled Thread';
    const thread_id = generateThreadId();
    const filename = generateVaultFilename();
    const vault_path = `${THREADS_FOLDER}/${filename}`;
    const now = new Date().toISOString();

    const meta: ThreadMeta = {
      thread_id,
      vault_path,
      title,
      created_at: now,
      updated_at: now,
      status: 'draft',
      turn_count: 0,
    };

    await addToVault(filename, buildFullNote(meta, []), THREADS_FOLDER);
    registry.set(thread_id, vault_path);

    res.json({ thread_id, vault_path, title });
  } catch (err) {
    console.error('[thread-builder/start]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/thread-builder/:id/turn
 * Body: { prompt: string, response: string, branch?: string }
 * Appends a turn to the vault note. Returns { turn_id, turn_number, turn_count }.
 */
threadBuilderRouter.post('/:id/turn', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { prompt, response, branch = 'main' } = req.body ?? {};

  if (!prompt?.trim() || !response?.trim()) {
    res.status(400).json({ error: 'prompt and response are required' });
    return;
  }

  try {
    let vault_path = registry.get(id);
    if (!vault_path) {
      vault_path = await findVaultPathById(id) ?? undefined;
      if (!vault_path) { res.status(404).json({ error: `Thread ${id} not found` }); return; }
      registry.set(id, vault_path);
    }

    const absPath = path.join(VAULT_ROOT, vault_path);
    const rawContent = await readVaultFile(absPath);
    const { meta, turns } = parseThreadNote(rawContent, vault_path);

    const newTurn: BuilderTurn = {
      turn_id: `turn_${String(turns.length + 1).padStart(3, '0')}`,
      turn_number: turns.length + 1,
      branch,
      timestamp: new Date().toISOString(),
      prompt: prompt.trim(),
      response: response.trim(),
    };

    turns.push(newTurn);
    meta.turn_count = turns.length;
    meta.updated_at = new Date().toISOString();

    const [, filename] = vault_path.split('/');
    await addToVault(filename, buildFullNote(meta, turns), THREADS_FOLDER);

    res.json({ turn_id: newTurn.turn_id, turn_number: newTurn.turn_number, turn_count: turns.length });
  } catch (err) {
    console.error('[thread-builder/:id/turn]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/thread-builder/:id/finalize
 * Marks thread status → 'complete'. Returns { vault_path, status, turn_count }.
 */
threadBuilderRouter.post('/:id/finalize', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    let vault_path = registry.get(id);
    if (!vault_path) {
      vault_path = await findVaultPathById(id) ?? undefined;
      if (!vault_path) { res.status(404).json({ error: `Thread ${id} not found` }); return; }
      registry.set(id, vault_path);
    }

    const absPath = path.join(VAULT_ROOT, vault_path);
    const rawContent = await readVaultFile(absPath);
    const { meta, turns } = parseThreadNote(rawContent, vault_path);

    meta.status = 'complete';
    meta.updated_at = new Date().toISOString();

    const [, filename] = vault_path.split('/');
    await addToVault(filename, buildFullNote(meta, turns), THREADS_FOLDER);

    res.json({ vault_path, status: 'complete', turn_count: turns.length });
  } catch (err) {
    console.error('[thread-builder/:id/finalize]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/thread-builder/:id/fork
 * Body: { after_turn: number, title?: string }
 * Creates a new thread containing turns 1..after_turn from the source thread.
 * Returns { thread_id, vault_path, title, forked_from_turn }.
 */
threadBuilderRouter.post('/:id/fork', async (req: Request, res: Response) => {
  const { id } = req.params;
  const after_turn = parseInt(req.body?.after_turn, 10);
  if (!Number.isInteger(after_turn) || after_turn < 1) {
    res.status(400).json({ error: 'after_turn must be a positive integer' });
    return;
  }

  try {
    let vault_path = registry.get(id);
    if (!vault_path) {
      vault_path = await findVaultPathById(id) ?? undefined;
      if (!vault_path) { res.status(404).json({ error: `Thread ${id} not found` }); return; }
      registry.set(id, vault_path);
    }

    const absPath = path.join(VAULT_ROOT, vault_path);
    const rawContent = await readVaultFile(absPath);
    const { meta: sourceMeta, turns: sourceTurns } = parseThreadNote(rawContent, vault_path);

    const forkTurns = sourceTurns.filter(t => t.turn_number <= after_turn);
    if (forkTurns.length === 0) {
      res.status(400).json({ error: `No turns found up to turn ${after_turn}` });
      return;
    }

    const defaultTitle = `${sourceMeta.title} (fork @ turn ${after_turn})`;
    const title: string = req.body?.title?.trim() || defaultTitle;
    const thread_id = generateThreadId();
    const filename = generateVaultFilename();
    const new_vault_path = `${THREADS_FOLDER}/${filename}`;
    const now = new Date().toISOString();

    const forkMeta: ThreadMeta = {
      thread_id,
      vault_path: new_vault_path,
      title,
      created_at: now,
      updated_at: now,
      status: 'draft',
      turn_count: forkTurns.length,
      forked_from: id,
      forked_from_turn: after_turn,
    };

    await addToVault(filename, buildFullNote(forkMeta, forkTurns), THREADS_FOLDER);
    registry.set(thread_id, new_vault_path);

    res.json({ thread_id, vault_path: new_vault_path, title, forked_from_turn: after_turn });
  } catch (err) {
    console.error('[thread-builder/:id/fork]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/thread-builder/:id
 * Reads vault note, returns { meta, turns } for Phase 2 resume.
 */
threadBuilderRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    let vault_path = registry.get(id);
    if (!vault_path) {
      vault_path = await findVaultPathById(id) ?? undefined;
      if (!vault_path) { res.status(404).json({ error: `Thread ${id} not found` }); return; }
      registry.set(id, vault_path);
    }

    const absPath = path.join(VAULT_ROOT, vault_path);
    const rawContent = await readVaultFile(absPath);
    const result = parseThreadNote(rawContent, vault_path);
    res.json(result);
  } catch (err) {
    console.error('[thread-builder/:id GET]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/thread-builder
 * Lists all thread notes in Threads/. Returns ThreadMeta[].
 */
threadBuilderRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const absFolder = path.join(VAULT_ROOT, THREADS_FOLDER);
    const dir = await listVaultDirectory(absFolder);
    const mdFiles = dir.entries.filter(e => e.name.endsWith('.md') && e.name.startsWith('thread-'));

    const threads: ThreadMeta[] = [];
    for (const entry of mdFiles) {
      const relPath = `${THREADS_FOLDER}/${entry.name}`;
      const absPath = path.join(VAULT_ROOT, relPath);
      try {
        const content = await readVaultFile(absPath);
        // Only read frontmatter (first ~500 chars) for the list view
        const { meta } = parseThreadNote(content.slice(0, 800), relPath);
        if (meta.thread_id) threads.push(meta);
      } catch { /* skip */ }
    }

    // Newest first
    threads.sort((a, b) => b.created_at.localeCompare(a.created_at));
    res.json(threads);
  } catch (err) {
    console.error('[thread-builder GET /]', err);
    res.status(500).json({ error: (err as Error).message });
  }
});
