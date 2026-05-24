/**
 * routes/proposals.ts — build-proposal review endpoints.
 *
 * Build proposals are agent_tasks with task_type=build_proposal (or tagged
 * build-proposal) and review_due=1. They sit in the pending queue, skipped by
 * the meta-agent loop, until a human approves or rejects them here.
 *
 * Approve → bulk_approve sets review_due=0  → swarm picks up on next cycle
 * Reject  → bulk_approve sets status=blocked → archived, not re-run
 */
import { Router, Request, Response } from 'express';
import * as flint from '../services/flintMcp';
import { AgentTask } from '../types/AgentTask';

export const proposalsRouter = Router();

function isProposal(t: AgentTask): boolean {
  return (
    t.review_due === 1 &&
    (t.task_type === 'build_proposal' || !!t.tags?.includes('build-proposal'))
  );
}

// GET /api/proposals — list pending build proposals
proposalsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const { tasks } = await flint.listTasksPaged(undefined, 200, 0);
    const items = tasks.filter(isProposal)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.created_at - a.created_at);
    res.json({ items, total: items.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/proposals/count — badge count
proposalsRouter.get('/count', async (_req: Request, res: Response) => {
  try {
    const { tasks } = await flint.listTasksPaged(undefined, 200, 0);
    const count = tasks.filter(isProposal).length;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/proposals/:id/approve — release to the swarm (review_due=0)
proposalsRouter.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await flint.bulkApprove([id], []);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/proposals/:id/reject — archive as blocked
proposalsRouter.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await flint.bulkApprove([], [id]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
