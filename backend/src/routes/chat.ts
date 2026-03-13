/**
 * routes/chat.ts — direct Flint chat via route_and_query.
 */
import { Router, Request, Response } from 'express';
import * as flint from '../services/flintMcp';

export const chatRouter = Router();

// POST /api/chat — send a prompt to Flint, get a response back
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body as { prompt?: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }
    const result = await flint.routeAndQuery(prompt.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
