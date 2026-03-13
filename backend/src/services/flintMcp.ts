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
import { AgentTask, AgentTaskPatch, ApprovalItem, NewTaskPayload } from '../types/AgentTask';

const FLINT_URL = process.env.FLINT_MCP_URL ?? 'http://127.0.0.1:18765/mcp';
const DISABLE_ESCALATION = process.env.DISABLE_ESCALATION === 'true';

// Dashboard MVP allowlist — only these tools may be called from Node
const ALLOWED_TOOLS = new Set([
  'list_agent_tasks',
  'get_task_detail',
  'get_task_with_children',
  'get_task_queue_stats',
  'add_agent_task',
  'add_session_task',
  'list_session_tasks',
  'update_task_metadata',
  'get_pending_approvals',
  'bulk_approve',
  'flush_pending_writes',
  'start_task_processing',
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

export async function listTasks(status?: string, limit = 50): Promise<AgentTask[]> {
  const r = await callTool('list_agent_tasks', { status, limit, exclude_children: true }) as {
    tasks?: AgentTask[];
  };
  return r?.tasks ?? [];
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
