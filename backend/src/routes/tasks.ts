/**
 * routes/tasks.ts — task CRUD endpoints, all data via flintMcp.ts.
 */
import { Router, Request, Response } from 'express';
import * as flint from '../services/flintMcp';
import { readFrontmatter, readVaultDocBody } from '../services/vaultReader';
import { AgentTaskPatch, NewTaskPayload } from '../types/AgentTask';

export const tasksRouter = Router();

// GET /api/tasks — list tasks with pagination (?status=, ?limit=, ?offset=, ?channel=)
tasksRouter.get('/', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
    const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
    const offset = req.query.offset ? Math.max(Number(req.query.offset), 0) : 0;
    const result = await flint.listTasksPaged(status, limit, offset);
    const tasks = channel
      ? result.tasks.filter(t => t.tags?.includes(`channel:${channel}`))
      : result.tasks;
    res.json({ tasks, total: channel ? tasks.length : result.total, offset, limit });
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

// GET /api/tasks/:id/haiku — fetch the haiku linked to this task's vault_note
tasksRouter.get('/:id/haiku', async (req: Request, res: Response) => {
  try {
    const task = await flint.getTask(req.params.id);
    if (!task?.vault_note) {
      res.json({ haiku: null });
      return;
    }
    const haiku = await flint.getHaikuBySourceDoc(task.vault_note);
    res.json({ haiku: haiku ?? null });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/tasks/:id/vault-doc — return vault doc body as markdown
tasksRouter.get('/:id/vault-doc', async (req: Request, res: Response) => {
  try {
    const task = await flint.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: `Task not found: ${req.params.id}` });
      return;
    }
    if (!task.vault_note) {
      res.status(404).json({ error: 'No vault_note on this task' });
      return;
    }
    const markdown = readVaultDocBody(task.vault_note);
    res.json({ task_id: task.id, vault_note: task.vault_note, markdown: markdown ?? '' });
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
    // Fetch the full task record so the frontend has a complete AgentTask object
    const task = await flint.getTask(result.task_id);
    res.status(201).json(task ?? result);
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

// POST /api/tasks/:id/process — release gate, create vault doc, generate haiku (background)
tasksRouter.post('/:id/process', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const result = await flint.processTask(taskId);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }

    // Respond immediately; haiku generation runs in the background
    res.json({ ...result, haiku_pending: result.vault_note_created });

    // Background: generate + register a haiku only on first process
    if (result.vault_note_created) {
      void (async () => {
        try {
          const task = await flint.getTask(taskId);
          if (!task) return;
          const haikuResp = await flint.routeAndQuery(
            `Write a 3-line haiku (5-7-5 syllables) that captures the essence of this task.` +
            ` Output ONLY the 3 lines, nothing else.\n\nTask: ${task.title}` +
            (task.description ? `\n${task.description.slice(0, 200)}` : ''),
          );
          const raw = (haikuResp.response ?? '').replace(/\n\n---[\s\S]*$/, '').trim();
          const lines = raw.split('\n').map((l: string) => l.trim()).filter(Boolean).slice(0, 3);
          if (lines.length === 3) {
            await flint.registerHaiku(
              lines.join('\n'),
              result.vault_note,
              new Date().toISOString().split('T')[0],
            );
          }
        } catch (e) {
          console.warn('[process] haiku generation failed:', (e as Error).message);
        }
      })();
    }
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

// POST /api/tasks/:id/plan — Sonnet plans the task, creates child session_tasks immediately.
// Flow: route_and_query (local) → escalate to Sonnet if confidence < 0.8
//       → parsePlan() → add_session_task per step → return children list.
tasksRouter.post('/:id/plan', async (req: Request, res: Response) => {
  try {
    const result = await flint.planTask(req.params.id);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
