/**
 * routes/vault.ts — read-only vault file access.
 *
 * Used by the shared VaultDocViewerComponent to load any vault markdown
 * file by its vault-relative path.
 *
 * GET /api/vault/doc?path=Sessions/2026-03-14-foo.md
 *   → { path, markdown }
 *
 * GET /api/vault/preview?path=Inbox/MY-DOC.md
 *   → { path, title, has_frontmatter, frontmatter }
 *   Used by the new-task modal to auto-fill title from a vault_link path.
 *
 * --- Vault Browse/Search routes (used by the Vault page) ---
 * GET /api/vault/browse?folder=Threads
 *   → { folder, entries: [{name, type, size_bytes}] }
 *
 * GET /api/vault/file?path=Threads/foo.md
 *   → { path, markdown }
 *
 * GET /api/vault/search?q=query&limit=10
 *   → { results: [{title, path, excerpt, modified}] }
 */
import fs from 'fs';
import path from 'path';
import { Router, Request, Response } from 'express';
import { readVaultDocBody, readFrontmatter } from '../services/vaultReader';
import { listVaultDirectory, searchVaultNotes } from '../services/flintMcp';

const VAULT_PATH = process.env.VAULT_PATH ?? '';

export const vaultRouter = Router();

vaultRouter.get('/doc', (req: Request, res: Response) => {
  const p = typeof req.query['path'] === 'string' ? req.query['path'].trim() : '';
  if (!p) {
    res.status(400).json({ error: 'path query param is required' });
    return;
  }
  const markdown = readVaultDocBody(p);
  if (markdown === null) {
    res.status(404).json({ error: `Vault doc not found: ${p}` });
    return;
  }
  res.json({ path: p, markdown });
});

// GET /api/vault/preview?path=Inbox/MY-DOC.md
// Returns title + frontmatter for modal auto-fill — used before a task exists.
vaultRouter.get('/preview', (req: Request, res: Response) => {
  const p = typeof req.query['path'] === 'string' ? req.query['path'].trim() : '';
  if (!p) {
    res.status(400).json({ error: 'path query param is required' });
    return;
  }

  // Check file exists by trying to read it
  const markdown = readVaultDocBody(p);
  if (markdown === null) {
    res.status(404).json({ error: `Vault doc not found: ${p}` });
    return;
  }

  const frontmatter = readFrontmatter(p);
  const hasFrontmatter = Object.keys(frontmatter).length > 0;

  // Extract title: prefer frontmatter.title, then first # heading in body
  let title = typeof frontmatter['title'] === 'string' ? frontmatter['title'] : '';
  if (!title) {
    const headingMatch = markdown.match(/^#\s+(.+)/m);
    if (headingMatch) title = headingMatch[1].trim();
  }
  if (!title) title = p.split('/').pop()?.replace(/\.md$/i, '') ?? '';

  res.json({ path: p, title, has_frontmatter: hasFrontmatter, frontmatter });
});

// ----------------------------------------------------------------------------
// Vault Browse / Search  (used by the Vault page in the dashboard)
// ----------------------------------------------------------------------------

// GET /api/vault/browse?folder=Threads
// Calls Flint list_directory with the vault-absolute folder path.
vaultRouter.get('/browse', async (req: Request, res: Response) => {
  const folder = typeof req.query['folder'] === 'string' ? req.query['folder'].trim() : '';
  if (!folder) {
    res.status(400).json({ error: 'folder query param is required' });
    return;
  }
  if (!VAULT_PATH) {
    res.status(500).json({ error: 'VAULT_PATH not configured on server' });
    return;
  }
  // Security: reject path traversal
  const absFolder = path.resolve(VAULT_PATH, folder);
  if (!absFolder.startsWith(path.resolve(VAULT_PATH) + path.sep) && absFolder !== path.resolve(VAULT_PATH)) {
    res.status(400).json({ error: 'Invalid folder path' });
    return;
  }
  try {
    const result = await listVaultDirectory(absFolder);
    const entries = result.entries.map((e) => {
      let mtime_ms = 0;
      try { mtime_ms = fs.statSync(path.join(absFolder, e.name)).mtimeMs; } catch { /**/ }
      return { ...e, mtime_ms };
    });
    res.json({ folder, entries });
  } catch (err) {
    const msg = String(err);
    // Return empty gracefully if folder doesn't exist yet
    if (msg.includes('Not a directory') || msg.includes('ENOENT') || msg.includes('No such')) {
      res.json({ folder, entries: [] });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

// GET /api/vault/file?path=Threads/foo.md
// Reads a vault-relative file path directly from the filesystem.
vaultRouter.get('/file', (req: Request, res: Response) => {
  const p = typeof req.query['path'] === 'string' ? req.query['path'].trim() : '';
  if (!p) {
    res.status(400).json({ error: 'path query param is required' });
    return;
  }
  const markdown = readVaultDocBody(p);
  if (markdown === null) {
    res.status(404).json({ error: `Vault file not found: ${p}` });
    return;
  }
  res.json({ path: p, markdown });
});

// GET /api/vault/search?q=query&limit=10
// Full-text search via Flint search_vault tool.
vaultRouter.get('/search', async (req: Request, res: Response) => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
  if (!q) {
    res.json({ results: [] });
    return;
  }
  const limit = Math.min(parseInt(String(req.query['limit'] ?? '10'), 10) || 10, 50);
  try {
    const results = await searchVaultNotes(q, limit);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ----------------------------------------------------------------------------
// POST /api/vault/process-thread
// Reads a Threads/ file, asks Claude to generate title+frontmatter, writes
// updated file, renames if "Untitled", returns { old_path, new_path, title }.
// ----------------------------------------------------------------------------
vaultRouter.post('/process-thread', async (req: Request, res: Response) => {
  const p = typeof req.body?.path === 'string' ? (req.body.path as string).trim() : '';
  if (!p) { res.status(400).json({ error: 'path is required' }); return; }
  if (!VAULT_PATH) { res.status(500).json({ error: 'VAULT_PATH not configured' }); return; }

  const absPath = path.resolve(VAULT_PATH, p);
  const vaultRoot = path.resolve(VAULT_PATH);
  if (!absPath.startsWith(vaultRoot + path.sep) && absPath !== vaultRoot) {
    res.status(400).json({ error: 'Invalid path' }); return;
  }
  if (!fs.existsSync(absPath)) { res.status(404).json({ error: `File not found: ${p}` }); return; }

  const content = fs.readFileSync(absPath, 'utf-8');

  // Strip existing frontmatter if present before sending to Claude
  const bodyOnly = content.startsWith('---')
    ? content.replace(/^---[\s\S]*?---\n?/, '').trim()
    : content.trim();

  const { queryClaudeForPlan } = await import('../services/flintMcp');
  const prompt = [
    'You are a note processing assistant. Analyze the following markdown thread document.',
    'Return a JSON object (no markdown fences) with these fields:',
    '  title: string — concise 4-8 word title describing the main topic',
    '  tags: string[] — 3-6 relevant lowercase tags',
    '  project: string — most relevant project name, or empty string',
    '  type: "thread"',
    '  summary: string — one sentence summary (≤120 chars)',
    '',
    'DOCUMENT:',
    bodyOnly.slice(0, 4000),
  ].join('\n');

  let claudeRaw: string;
  try {
    const result = await queryClaudeForPlan(prompt, 512);
    claudeRaw = result.response.trim();
  } catch (err) {
    res.status(502).json({ error: `Claude API error: ${String(err)}` }); return;
  }

  // Parse JSON from Claude (handle possible ```json fences)
  let meta: { title?: string; tags?: string[]; project?: string; type?: string; summary?: string };
  try {
    const jsonStr = claudeRaw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    meta = JSON.parse(jsonStr);
  } catch {
    res.status(502).json({ error: `Could not parse Claude response as JSON: ${claudeRaw.slice(0, 200)}` }); return;
  }

  const title = (meta.title ?? 'Processed Thread').trim();
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  const project = typeof meta.project === 'string' ? meta.project : '';
  const summary = typeof meta.summary === 'string' ? meta.summary : '';
  const now = new Date().toISOString().slice(0, 10);

  // Build frontmatter
  const fm = [
    '---',
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: ${now}`,
    `type: thread`,
    tags.length ? `tags: [${tags.map((t) => `"${t}"`).join(', ')}]` : '',
    project ? `project: "${project}"` : '',
    summary ? `summary: "${summary.replace(/"/g, '\\"')}"` : '',
    '---',
    '',
  ].filter((l) => l !== undefined && !(l !== '' && l === '')).join('\n');

  const newContent = fm + bodyOnly;

  // Determine new filename — rename if "untitled" anywhere in filename
  const basename = path.basename(p);
  const folder = path.dirname(p);
  let newBasename = basename;
  if (basename.toLowerCase().includes('untitled')) {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const datePart = basename.match(/(\d{8}-\d{6})/)?.[1] ?? now.replace(/-/g, '');
    const hexPart = basename.match(/([0-9a-f]{4})\.md$/i)?.[1] ?? Math.random().toString(16).slice(2, 6);
    newBasename = `thread-${datePart}-${hexPart}-${slug}.md`;
  }

  const newRelPath = folder === '.' ? newBasename : `${folder}/${newBasename}`;
  const newAbsPath = path.resolve(VAULT_PATH, newRelPath);

  fs.writeFileSync(newAbsPath, newContent, 'utf-8');
  if (newAbsPath !== absPath) fs.unlinkSync(absPath);

  res.json({ old_path: p, new_path: newRelPath, title, tags, project, summary });
});
