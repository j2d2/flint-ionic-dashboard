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
 */
import { Router, Request, Response } from 'express';
import { readVaultDocBody, readFrontmatter } from '../services/vaultReader';

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
