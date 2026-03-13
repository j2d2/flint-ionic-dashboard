/**
 * routes/tasks.ts — task CRUD endpoints, all data via flintMcp.ts.
 */
import { Router, Request, Response } from 'express';
import * as flint from '../services/flintMcp';
import { readFrontmatter } from '../services/vaultReader';
import { AgentTaskPatch, NewTaskPayload } from '../types/AgentTask';

export const tasksRouter = Router();

// GET /api/tasks — list tasks (optionally filtered by status)
tasksRouter.get('/', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const tasks = await flint.listTasks(status, limit);
    res.json({ tasks, total: tasks.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/tasks/stats — queue stats
tasksRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await flint.getQueueStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/tasks/:id — single task with children
tasksRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await flint.getTaskWithChildren(req.params.id);
    if (!result) {
      res.status(404).json({ error: `Task not found: ${req.params.id}` });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/tasks/:id/frontmatter — parse vault_note YAML frontmatter
tasksRouter.get('/:id/frontmatter', async (req: Request, res: Response) => {
  try {
    const task = await flint.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: `Task not found: ${req.params.id}` });
      return;
    }
    const frontmatter = readFrontmatter(task.vault_note ?? '');
    res.json({ task_id: task.id, vault_note: task.vault_note, frontmatter });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/tasks/create — create new task from composer
tasksRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const payload = req.body as NewTaskPayload;
    if (!payload.title?.trim()) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    // Enforce local-only: strip any escalation fields
    const clean: NewTaskPayload = {
      title: payload.title.trim(),
      description: payload.description ?? '',
      priority: payload.priority ?? 3,
      task_type: payload.task_type ?? 'agent_task',
      tags: payload.tags,
      vault_link: payload.vault_link,
      review_due: payload.review_due ?? false,
    };
    const result = await flint.createTask(clean);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/tasks/:id — update metadata (title, tags, status for lane moves, etc.)
tasksRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const patch = req.body as AgentTaskPatch;
    // Whitelist — only allow fields defined in AgentTaskPatch
    const allowed: (keyof AgentTaskPatch)[] = [
      'title', 'description', 'status', 'priority', 'task_type', 'tags',
      'vault_note', 'vault_link',
    ];
    const clean: AgentTaskPatch = {};
    for (const key of allowed) {
      if (key in patch) (clean as Record<string, unknown>)[key] = patch[key];
    }
    if (Object.keys(clean).length === 0) {
      res.status(400).json({ error: 'No patchable fields provided' });
      return;
    }
    const result = await flint.patchTask(req.params.id, clean);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/tasks/:id/process — release gate, create vault doc, ready for agent swarm
tasksRouter.post('/:id/process', async (req: Request, res: Response) => {
  try {
    const result = await flint.processTask(req.params.id);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/tasks/:id/chat — add a session_task (chat message) under parent
tasksRouter.post('/:id/chat', async (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content?: string };
    if (!content?.trim()) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    const result = await flint.addSessionTask(
      req.params.id,
      content.slice(0, 80),   // use first 80 chars as title
      content,
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
