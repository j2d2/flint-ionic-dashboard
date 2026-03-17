/**
 * flintMcp.ts — sole data access layer for the dashboard backend.
 *
 * All reads and writes go through Flint MCP HTTP. No direct SQLite access.
 * See: Decisions/2026-03-12-dashboard-flint-interface-decision.md
 *
 * Flint uses streamable-http transport; requests must include
 *   Accept: application/json, text/event-stream
 * and responses are SSE with `data:` prefixed JSON lines.
 */
import { AgentTask, AgentTaskPatch, ApprovalItem, NewTaskPayload, PlanResult, PlanStep } from '../types/AgentTask';

const FLINT_URL = process.env.FLINT_MCP_URL ?? 'http://127.0.0.1:18765/mcp';
const DISABLE_ESCALATION = process.env.DISABLE_ESCALATION === 'true';

// Dashboard MVP allowlist — only these tools may be called from Node
const ALLOWED_TOOLS = new Set([
  'list_agent_tasks',
  'get_task_detail',
  'get_task_with_children',
  'get_task_queue_stats',
  'route_and_query',
  'query_model',
  'query_claude_api',
  'add_agent_task',
  'add_session_task',
  'list_session_tasks',
  'update_task_metadata',
  'update_task_status',
  'get_pending_approvals',
  'bulk_approve',
  'flush_pending_writes',
  'start_task_processing',
  // Haiku leaderboard (haiku.db)
  'register_haiku',
  'list_haikus',
  'vote_haiku',
  'get_haiku_pair',
  // Vault
  'add_to_vault',
]);

async function callTool(name: string, args: object): Promise<unknown> {
  if (!ALLOWED_TOOLS.has(name)) {
    throw new Error(`Tool '${name}' is not in the dashboard allowlist.`);
  }
  if (DISABLE_ESCALATION && name === 'query_claude_api') {
    throw new Error('Escalation disabled (DISABLE_ESCALATION=true).');
  }

  const res = await fetch(FLINT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });

  if (!res.ok) {
    throw new Error(`Flint MCP HTTP ${res.status}: ${await res.text()}`);
  }

  // Streamable-http returns SSE — parse `data:` lines
  const raw = await res.text();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const blob = JSON.parse(trimmed.slice(5)) as {
        result?: { content?: Array<{ type: string; text: string }> };
        error?: { message: string };
      };
      if (blob.error) throw new Error(blob.error.message);
      const content = blob.result?.content;
      if (content?.[0]?.type === 'text') {
        return JSON.parse(content[0].text);
      }
      return blob.result;
    }
  }
  throw new Error('No data in Flint MCP response');
}

// ---------------------------------------------------------------------------
// Typed helpers used by route handlers
// ---------------------------------------------------------------------------

export async function listTasks(
  status?: string,
  limit = 100,
  offset = 0,
): Promise<AgentTask[]> {
  const r = await callTool('list_agent_tasks', { status, limit, offset, exclude_children: true }) as {
    tasks?: AgentTask[];
    total?: number;
  };
  return r?.tasks ?? [];
}

export async function listTasksPaged(
  status?: string,
  limit = 50,
  offset = 0,
): Promise<{ tasks: AgentTask[]; total: number }> {
  const r = await callTool('list_agent_tasks', { status, limit, offset, exclude_children: true }) as {
    tasks?: AgentTask[];
    total?: number;
  };
  return { tasks: r?.tasks ?? [], total: r?.total ?? 0 };
}

export async function getTask(id: string): Promise<AgentTask | null> {
  const r = await callTool('get_task_detail', { task_id: id }) as { task?: AgentTask } | null;
  return (r as { task?: AgentTask })?.task ?? (r as AgentTask | null);
}

export async function getTaskWithChildren(id: string): Promise<{
  task: AgentTask;
  session_tasks: AgentTask[];
  total_children: number;
  by_status: Record<string, number>;
  progress_pct: number;
} | null> {
  return (await callTool('get_task_with_children', { task_id: id })) as ReturnType<typeof getTaskWithChildren>;
}

export async function createTask(payload: NewTaskPayload): Promise<{ task_id: string; status: string; message?: string }> {
  return (await callTool('add_agent_task', payload)) as { task_id: string; status: string; message?: string };
}

export async function patchTask(id: string, patch: AgentTaskPatch): Promise<{ task_id: string; updated: boolean; fields: string[] }> {
  return (await callTool('update_task_metadata', { task_id: id, ...patch })) as {
    task_id: string;
    updated: boolean;
    fields: string[];
  };
}

export async function updateTaskStatus(
  id: string,
  status: 'done' | 'failed',
  output?: string,
  force = false,
): Promise<{ task_id: string; status: string; updated: boolean; cascaded_children: number } | { error: string; blocked?: boolean }> {
  return (await callTool('update_task_status', { task_id: id, status, output, force })) as ReturnType<typeof updateTaskStatus>;
}

export async function processTask(id: string): Promise<{
  task_id: string;
  vault_note: string;
  review_due: number;
  vault_note_created: boolean;
  message: string;
} | { error: string }> {
  return (await callTool('start_task_processing', { task_id: id })) as ReturnType<typeof processTask>;
}

export async function addSessionTask(parentId: string, title: string, description: string): Promise<{ task_id: string; parent_task_id: string; status: string }> {
  return (await callTool('add_session_task', {
    parent_task_id: parentId,
    title,
    description,
    task_type: 'session_task',
  })) as { task_id: string; parent_task_id: string; status: string };
}

export async function getApprovals(): Promise<ApprovalItem[]> {
  const r = await callTool('get_pending_approvals', {}) as {
    pending?: unknown[];
    items?: unknown[];
  } | unknown[];
  // normalize various response shapes Flint might return
  if (Array.isArray(r)) return r as ApprovalItem[];
  if ((r as { pending?: unknown[] }).pending) return (r as { pending: ApprovalItem[] }).pending;
  if ((r as { items?: unknown[] }).items) return (r as { items: ApprovalItem[] }).items;
  return [];
}

export async function bulkApprove(approveIds: string[], rejectIds: string[]): Promise<unknown> {
  return callTool('bulk_approve', {
    items: [],
    approve_ids: approveIds,
    reject_ids: rejectIds,
  });
}

export async function flushWrites(dryRun = false): Promise<unknown> {
  return callTool('flush_pending_writes', { dry_run: dryRun });
}

export async function getQueueStats(): Promise<unknown> {
  return callTool('get_task_queue_stats', {});
}

// ---------------------------------------------------------------------------
// Plan parser — converts Sonnet plan response into discrete PlanSteps.
//
// Recognises:
//   ## 1. Title          (ATX heading with number prefix)
//   ## Step 1: Title     (explicit "Step N:" prefix)
//   1. **Title**         (numbered list, bold title)
//   1. Title             (plain numbered list)
//   **Step 1: Title**    (bold paragraph step marker)
// ---------------------------------------------------------------------------
function parsePlan(text: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const lines = text.split('\n');

  let currentTitle = '';
  let currentBody: string[] = [];

  const flush = () => {
    const t = currentTitle.trim().slice(0, 120);
    const d = currentBody.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
    if (t.length > 2) steps.push({ title: t, description: d });
    currentTitle = '';
    currentBody = [];
  };

  // Strip a leading "N." / "Step N:" / "Step N." prefix from a heading
  const stripPrefix = (s: string) =>
    s.replace(/^(?:Step\s*\d+\s*[:.)]\s*|\d+[.)]\s*)/i, '').trim();

  for (const line of lines) {
    // ATX headings: #, ##, ### (any depth)
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      flush();
      currentTitle = stripPrefix(headingMatch[1]);
      continue;
    }

    // Bold paragraph marker: **Step N: Title** or **N. Title**
    const boldStepMatch = line.match(/^\*{1,2}(Step\s*\d+\s*[:.)]\s*.+?|[\d]+[.)]\s+.+?)\*{1,2}\s*$/i);
    if (boldStepMatch) {
      flush();
      currentTitle = stripPrefix(boldStepMatch[1]);
      continue;
    }

    // Numbered list item: "1. Title" or "1. **Title** — description"
    const numListMatch = line.match(/^(\d+)[.)]\s+\*{0,2}([^*\n]+?)\*{0,2}(?:\s+[—–-]\s+(.+))?$/);
    if (numListMatch) {
      flush();
      currentTitle = numListMatch[2].trim();
      if (numListMatch[3]) currentBody.push(numListMatch[3].trim());
      continue;
    }

    // Body text accumulation
    if (currentTitle) {
      const t = line.trim();
      if (t && !t.startsWith('---')) currentBody.push(t);
    }
  }

  flush();

  // Filter noise (very short "titles" are usually stray lines)
  return steps.filter(s => s.title.length > 3);
}

// ---------------------------------------------------------------------------
// planTask — ask Sonnet to plan a task, then create children immediately.
// ---------------------------------------------------------------------------
const PLAN_SYSTEM = `You are the orchestrator of a local AI agent swarm (Flint/OpenClaw).
Your job: given a task, produce a numbered implementation plan.

Rules:
- Output numbered sections (## 1. Title) immediately — no preamble.
- Each section = one executable sub-task: name files, tools, commands.
- 3–7 steps. Each title ≤ 10 words. Each body ≤ 3 sentences.
- No meta-commentary, no "here is my plan", no closing summary.`;

export async function planTask(taskId: string): Promise<PlanResult | { error: string }> {
  // 1. Fetch parent task
  const task = await getTask(taskId);
  if (!task) return { error: `Task not found: ${taskId}` };

  const prompt = [
    `Task: ${task.title}`,
    `Type: ${task.task_type}  Priority: ${task.priority}`,
    task.description ? `\nDescription:\n${task.description.slice(0, 600)}` : '',
    '\nProduce an implementation plan.',
  ].join('\n').trim();

  // 2. Try local routing first (route_and_query classifies + scores)
  type RouteResult = {
    response: string;
    should_escalate: boolean;
    model?: string;
    confidence?: number;
    escalation_prompt?: string;
  };

  const localResult = await callTool('route_and_query', {
    prompt,
    system: PLAN_SYSTEM,
  }) as RouteResult;

  let planText: string = localResult.response ?? '';
  let modelUsed: string = localResult.model ?? 'local';
  let costUsd: number | undefined;
  let didEscalate = false;

  // 3. Escalate to Sonnet if confidence < threshold (planning threshold = 0.8)
  if (localResult.should_escalate) {
    type ClaudeResult = { response: string; model: string; cost_estimate_usd?: number };

    const claudeResult = await callTool('query_claude_api', {
      prompt: localResult.escalation_prompt ?? prompt,
      system: PLAN_SYSTEM,
      local_context: localResult,
      max_tokens: 2048,
    }) as ClaudeResult;

    planText = claudeResult.response ?? planText;
    modelUsed = claudeResult.model ?? modelUsed;
    costUsd = claudeResult.cost_estimate_usd;
    didEscalate = true;
  }

  // 4. Strip Flint footer banner (⚡ Flint local · …)
  planText = planText.replace(/\n\n---\n⚡ Flint local[^\n]*/s, '').trim();

  // 5. Parse plan → steps
  let steps = parsePlan(planText);
  if (steps.length === 0) {
    // Graceful fallback: single child with full response as description
    steps = [{ title: `Plan: ${task.title}`.slice(0, 120), description: planText.slice(0, 800) }];
  }

  // 6. Create session_task children under the parent (immediately executable)
  const children: PlanResult['children'] = [];
  for (const step of steps) {
    try {
      const r = await addSessionTask(taskId, step.title, step.description);
      children.push({ task_id: r.task_id, parent_task_id: taskId, title: step.title });
    } catch (e) {
      console.warn(`[planTask] child task creation failed for "${step.title}":`, (e as Error).message);
    }
  }

  return {
    plan_text: planText,
    model_used: modelUsed,
    cost_usd: costUsd,
    did_escalate: didEscalate,
    steps_parsed: steps.length,
    children,
  };
}

/** Direct chat — calls Flint's route_and_query and returns the response. */
export async function routeAndQuery(prompt: string): Promise<{
  response: string;
  model?: string;
  should_escalate?: boolean;
  confidence?: number;
}> {
  return callTool('route_and_query', { prompt }) as Promise<{
    response: string;
    model?: string;
    should_escalate?: boolean;
    confidence?: number;
  }>;
}

// ---------------------------------------------------------------------------
// Claude Sonnet plan generation — always escalates, no local fallback.
// ---------------------------------------------------------------------------
const SONNET_PLAN_SYSTEM =
  `You are the orchestrator of a local AI agent swarm (Flint/OpenClaw).
` +
  `Given a task, produce a concrete, numbered implementation plan.\n\n` +
  `Rules:\n` +
  `- Output numbered sections (## 1. Title) immediately — no preamble.\n` +
  `- Each section = one executable sub-task: name files, tools, commands.\n` +
  `- 3–7 steps. Each title ≤ 10 words. Each body ≤ 3 sentences.\n` +
  `- No meta-commentary, no "here is my plan", no closing summary.`;

export function buildPlanPrompt(task: AgentTask): string {
  return [
    `Task: ${task.title}`,
    `Type: ${task.task_type}  Priority: P${task.priority}`,
    task.tags ? `Tags: ${task.tags}` : '',
    task.description ? `\nDescription:\n${task.description.slice(0, 800)}` : '',
    '\nProduce an implementation plan with specific file paths, tools, and commands.',
  ].filter(Boolean).join('\n').trim();
}

export async function queryClaudeForPlan(
  prompt: string,
  maxTokens = 2048,
): Promise<{ response: string; model: string; cost_estimate_usd?: number }> {
  const r = await callTool('query_claude_api', {
    prompt,
    system: SONNET_PLAN_SYSTEM,
    max_tokens: maxTokens,
  });
  const obj = r as Record<string, unknown>;
  if (!obj.response && !obj.text) throw new Error('Claude API returned empty response');
  return {
    response: String(obj.response ?? obj.text ?? ''),
    model: String(obj.model ?? 'claude-sonnet-4-6'),
    cost_estimate_usd: typeof obj.cost_estimate_usd === 'number' ? obj.cost_estimate_usd : undefined,
  };
}

/** Direct model call — bypasses routing, uses the specified model. */
export async function queryModel(prompt: string, model: string): Promise<{
  response: string;
  model?: string;
}> {
  const raw = await callTool('query_model', { prompt, model });
  if (typeof raw === 'string') return { response: raw, model };
  const obj = raw as Record<string, unknown>;
  return {
    response: ((obj.response ?? obj.text ?? String(raw)) as string),
    model: ((obj.model ?? model) as string),
  };
}

// ---------------------------------------------------------------------------
// Haiku leaderboard helpers (haiku.db — separate from tasks.db)
// ---------------------------------------------------------------------------

export interface HaikuEntry {
  id: string;
  haiku_text: string;   // newline-separated 3 lines (5-7-5)
  source_doc?: string;  // vault-relative path, e.g. Sessions/YYYY-MM-DD-slug.md
  session_date?: string;
  vote_count: number;
  created_at: number;
}

export async function listHaikus(
  limit = 20,
  sortBy: 'votes' | 'newest' = 'votes',
  offset = 0,
): Promise<{ haikus: HaikuEntry[]; total: number }> {
  const r = await callTool('list_haikus', { limit, offset, sort_by: sortBy }) as {
    haikus?: HaikuEntry[];
    total?: number;
  };
  return { haikus: r?.haikus ?? [], total: r?.total ?? 0 };
}

export async function voteHaiku(
  haikuId: string,
  voterId: string,
  choreId?: string,
): Promise<{ status: 'voted' | 'already_voted'; vote_count: number; haiku_id: string }> {
  return (await callTool('vote_haiku', { haiku_id: haikuId, voter_id: voterId, chore_id: choreId ?? null })) as ReturnType<typeof voteHaiku>;
}

export async function getHaikuPair(
  voterId: string,
): Promise<{ a: HaikuEntry; b: HaikuEntry } | { status: 'no_more_pairs' }> {
  return (await callTool('get_haiku_pair', { voter_id: voterId })) as ReturnType<typeof getHaikuPair>;
}

export async function registerHaiku(
  haikuText: string,
  sourceDoc?: string,
  sessionDate?: string,
): Promise<{ status: string; haiku_id?: string }> {
  return (await callTool('register_haiku', {
    haiku_text: haikuText,
    source_doc: sourceDoc ?? null,
    session_date: sessionDate ?? null,
  })) as { status: string; haiku_id?: string };
}

export async function getHaikuBySourceDoc(sourceDoc: string): Promise<HaikuEntry | null> {
  const { haikus } = await listHaikus(200, 'newest');
  return haikus.find(h => h.source_doc === sourceDoc) ?? null;
}

// ---------------------------------------------------------------------------
// Vault helpers
// ---------------------------------------------------------------------------

/** Write a markdown document to the Obsidian vault via Flint. */
export async function addToVault(
  filename: string,
  content: string,
  folder = 'Inbox',
): Promise<{ path: string; vault_path?: string; status?: string }> {
  const r = await callTool('add_to_vault', { filename, content, folder });
  const obj = r as Record<string, unknown>;
  // Flint may return { path } or { vault_path } depending on version
  return {
    path: (obj.path ?? obj.vault_path ?? `${folder}/${filename}`) as string,
    vault_path: obj.vault_path as string | undefined,
    status: obj.status as string | undefined,
  };
}

