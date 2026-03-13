/**
 * routes/threads.ts — SSE stream of ThreadEvents from the JSONL tool call log.
 */
import { Router, Request, Response } from 'express';
import { threadEvents } from '../services/toolCallTailer';
import { ThreadEvent } from '../types/AgentTask';

export const threadsRouter = Router();

/**
 * GET /api/threads/:taskId/events
 * Server-Sent Events stream of ThreadEvents for a specific task.
 * Client receives events as: `data: <json>\n\n`
 */
threadsRouter.get('/:taskId/events', (req: Request, res: Response) => {
  const { taskId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // disable nginx buffering
  res.flushHeaders();

  const send = (evt: ThreadEvent) => {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  // Heartbeat every 20s to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20_000);

  const eventKey = `thread:event:${taskId}`;
  threadEvents.on(eventKey, send);

  req.on('close', () => {
    clearInterval(heartbeat);
    threadEvents.off(eventKey, send);
  });
});
