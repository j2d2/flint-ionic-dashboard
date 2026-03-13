/**
 * routes/approvals.ts — approval queue endpoints, all data via flintMcp.ts.
 */
import { Router, Request, Response } from 'express';
import * as flint from '../services/flintMcp';

export const approvalsRouter = Router();

// GET /api/approvals?status=pending — list pending review_due=1 tasks
approvalsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const items = await flint.getApprovals();
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/approvals/bulk — approve or reject a set of items
approvalsRouter.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { approve_ids, reject_ids } = req.body as {
      approve_ids?: string[];
      reject_ids?: string[];
    };
    if (!approve_ids && !reject_ids) {
      res.status(400).json({ error: 'approve_ids or reject_ids required' });
      return;
    }
    const result = await flint.bulkApprove(approve_ids ?? [], reject_ids ?? []);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/approvals/flush — commit approved staged writes to vault + task queue
approvalsRouter.post('/flush', async (req: Request, res: Response) => {
  try {
    const { dry_run } = req.body as { dry_run?: boolean };
    const result = await flint.flushWrites(dry_run ?? false);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
