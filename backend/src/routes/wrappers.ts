/**
 * routes/wrappers.ts — expose prompt wrapper templates to the dashboard.
 *
 * Reads .wrapper.md files directly from the vault Wrappers/modes/ directory.
 * No Flint MCP hop needed — these are static files.
 *
 * GET /api/wrappers        → array of WrapperMeta
 */
import { Router, Request, Response } from 'express';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const wrappersRouter = Router();

const WRAPPERS_DIR = process.env.VAULT_WRAPPERS_PATH
  ?? '/Users/jd/Documents/ai-ml/openclaw-instance/projects/obsidian-vault/Wrappers/modes';

interface WrapperMeta {
  name: string;
  description: string;
  trigger: string;
  agent: string;
  mode: string;
  template: string;
}

function parseWrapper(name: string, filePath: string): WrapperMeta | null {
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  const frontmatterMatch = raw.match(/^---\n([\s\S]+?)\n---/);
  const meta: Record<string, string> = {};
  if (frontmatterMatch) {
    for (const line of frontmatterMatch[1].split('\n')) {
      const colon = line.indexOf(':');
      if (colon > 0) {
        const key = line.slice(0, colon).trim();
        const val = line.slice(colon + 1).trim().replace(/^["']|["']$/g, '');
        meta[key] = val;
      }
    }
  }
  // Template body is everything after the closing ---
  const parts = raw.split('---');
  const template = parts.length >= 3 ? parts.slice(2).join('---').trim() : '';

  return {
    name,
    description: meta['description'] ?? '',
    trigger: meta['trigger'] ?? '',
    agent: meta['agent'] ?? 'local',
    mode: meta['mode'] ?? '',
    template,
  };
}

wrappersRouter.get('/', (_req: Request, res: Response) => {
  try {
    if (!existsSync(WRAPPERS_DIR)) {
      res.json({ wrappers: [] });
      return;
    }
    const files = readdirSync(WRAPPERS_DIR).filter(f => f.endsWith('.wrapper.md')).sort();
    const wrappers: WrapperMeta[] = [];
    for (const file of files) {
      const name = file.replace('.wrapper.md', '');
      const parsed = parseWrapper(name, join(WRAPPERS_DIR, file));
      if (parsed) wrappers.push(parsed);
    }
    res.json({ wrappers });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
