/**
 * routes/vault.ts — read-only vault file access.
 *
 * Used by the shared VaultDocViewerComponent to load any vault markdown
 * file by its vault-relative path.
 *
 * GET /api/vault/doc?path=Sessions/2026-03-14-foo.md
 *   → { path, markdown }
 */
import { Router, Request, Response } from 'express';
import { readVaultDocBody } from '../services/vaultReader';

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
