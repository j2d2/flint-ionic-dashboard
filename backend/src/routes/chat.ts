/**
 * routes/chat.ts — direct Flint chat via route_and_query or query_model.
 */
import { Router, Request, Response } from 'express';
import * as flint from '../services/flintMcp';

export const chatRouter = Router();

// POST /api/chat — send a prompt (+ optional model override) to Flint
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { prompt, model } = req.body as { prompt?: string; model?: string };
    if (!prompt?.trim()) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }
    const result =
      model && model !== 'auto'
        ? await flint.queryModel(prompt.trim(), model)
        : await flint.routeAndQuery(prompt.trim());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
