/**
 * routes/tasks.ts — task CRUD endpoints, all data via flintMcp.ts.
 */
import { Router, Request, Response } from 'express';
import * as flint from '../services/flintMcp';
import { readFrontmatter, readVaultDocBody, patchVaultOutput } from '../services/vaultReader';
import { AgentTaskPatch, NewTaskPayload } from '../types/AgentTask';

export const tasksRouter = Router();

// GET /api/tasks — list tasks with pagination
// Query params: ?status= (single or comma-separated), ?review_due=, ?order_by=, ?order_dir=, ?channel=, ?limit=, ?offset=
tasksRouter.get('/', async (req: Request, res: Response) => {
  try {
    const statusRaw  = typeof req.query.status    === 'string' ? req.query.status    : undefined;
    const channel    = typeof req.query.channel   === 'string' ? req.query.channel   : undefined;
    const reviewDue  = req.query.review_due === '1' ? 1 : undefined;
    const orderBy    = ['updated_at', 'created_at', 'priority'].includes(req.query.order_by as string)
                         ? (req.query.order_by as string) : undefined;
    const orderDir   = req.query.order_dir === 'asc' ? 'asc' : 'desc';
    const limit      = req.query.limit  ? Math.min(Number(req.query.limit),  200) : 50;
    const offset     = req.query.offset ? Math.max(Number(req.query.offset), 0)   : 0;

    // Comma-separated ?status=blocked,failed → first status goes to MCP, rest filtered here
    const statuses   = statusRaw ? statusRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const mcpStatus  = statuses[0];           // MCP only supports one at a time
    const extraStatuses = statuses.slice(1);  // additional statuses filtered post-fetch

    // Fetch more when we'll post-filter, to avoid an under-filled page
    const fetchLimit = (reviewDue !== undefined || extraStatuses.length > 0) ? 200 : limit;
    const result = await flint.listTasksPaged(mcpStatus, fetchLimit, offset);

    let tasks = result.tasks;
    if (extraStatuses.length) tasks = tasks.filter(t => statuses.includes(t.status));
    if (reviewDue !== undefined) tasks = tasks.filter(t => t.review_due === reviewDue);
    if (channel)  tasks = tasks.filter(t => t.tags?.includes(`channel:${channel}`));
    if (orderBy)  tasks.sort((a, b) => {
      const av = orderBy === 'priority' ? (a.priority ?? 0) : (new Date(a[orderBy as 'updated_at' | 'created_at'] ?? 0).getTime());
      const bv = orderBy === 'priority' ? (b.priority ?? 0) : (new Date(b[orderBy as 'updated_at' | 'created_at'] ?? 0).getTime());
      return orderDir === 'asc' ? av - bv : bv - av;
    });

    const total = tasks.length;
    // Re-apply limit/offset after post-filters (only if we over-fetched)
    const sliced = (fetchLimit > limit) ? tasks.slice(0, limit) : tasks;
    res.json({ tasks: sliced, total, offset, limit });
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

// GET /api/tasks/search?title=&limit= — find active tasks by title substring (duplicate detection)
// Must be defined before /:id so Express doesn't treat "search" as a task id.
tasksRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.title === 'string' ? req.query.title.trim().toLowerCase() : '';
    if (!q || q.length < 3) { res.json({ tasks: [] }); return; }

    const limit = req.query.limit ? Math.min(Number(req.query.limit), 20) : 5;
    const result = await flint.listTasksPaged(undefined, 200, 0);

    const EXCLUDE = new Set(['done', 'failed', 'cancelled']);
    const matches = result.tasks
      .filter(t => !EXCLUDE.has(t.status) && t.title.toLowerCase().includes(q))
      .slice(0, limit)
      .map(t => ({ id: t.id, title: t.title, status: t.status }));

    res.json({ tasks: matches });
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

    // Build preview prompt for Sonnet confirmation step
    const taskForPrompt = await flint.getTask(taskId);
    const sonnetPreviewPrompt = taskForPrompt ? flint.buildPlanPrompt(taskForPrompt) : '';

    // Respond immediately; haiku generation runs in the background
    res.json({ ...result, haiku_pending: result.vault_note_created, sonnet_preview_prompt: sonnetPreviewPrompt });

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

// POST /api/tasks/:id/plan — send prompt to Claude Sonnet 4.6, patch vault doc output
tasksRouter.post('/:id/plan', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    const { prompt } = req.body as { prompt?: string };

    const task = await flint.getTask(taskId);
    if (!task) {
      res.status(404).json({ error: `Task not found: ${taskId}` });
      return;
    }

    const planPrompt = prompt?.trim() || flint.buildPlanPrompt(task);
    const claudeResult = await flint.queryClaudeForPlan(planPrompt);

    // Patch vault doc ## Output section with Claude's plan
    if (task.vault_note) {
      patchVaultOutput(task.vault_note, claudeResult.response);
    }

    // Save plan text as task output (move to done)
    await flint.updateTaskStatus(taskId, 'done', claudeResult.response.slice(0, 2000));

    res.json({
      task_id: taskId,
      plan_text: claudeResult.response,
      model_used: claudeResult.model,
      cost_usd: claudeResult.cost_estimate_usd,
      vault_note: task.vault_note,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/tasks/:id/threads — create a persisted Thread (session_task) under a parent agent_task.
// "Thread" = intentional work session, saved to DB with session_task_id + parent_task_id.
// Distinct from /chat which is ephemeral (no session_task created for that flow).
tasksRouter.post('/:id/threads', async (req: Request, res: Response) => {
  try {
    const parent = await flint.getTask(req.params.id);
    if (!parent) {
      res.status(404).json({ error: `Task not found: ${req.params.id}` });
      return;
    }
    const { title } = req.body as { title?: string };
    const defaultTitle = `Thread — ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`;
    const result = await flint.addSessionTask(
      req.params.id,
      (title?.trim() || defaultTitle),
      `Work session on: ${parent.title}`,
    );
    const task = await flint.getTask(result.task_id);
    res.status(201).json(task ?? result);
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

// POST /api/tasks/:id/submit-review — move agent_task to in_review (ready for finalization).
// A task must be in_review before it can be marked done.
tasksRouter.post('/:id/submit-review', async (req: Request, res: Response) => {
  try {
    const result = await flint.patchTask(req.params.id, { status: 'in_review' } as AgentTaskPatch);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    const task = await flint.getTask(req.params.id);
    res.json(task ?? result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/tasks/:id/finalize — mark agent_task done; cascades done to all session_tasks.
// Requires the task to be in_review first (enforced by update_task_status in Flint).
tasksRouter.post('/:id/finalize', async (req: Request, res: Response) => {
  try {
    const { output } = req.body as { output?: string };
    const result = await flint.updateTaskStatus(req.params.id, 'done', output);
    if ('error' in result) {
      res.status(400).json(result);
      return;
    }
    const task = await flint.getTask(req.params.id);
    res.json({ ...result, task: task ?? undefined });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
