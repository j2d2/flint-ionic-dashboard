/** Statuses from the real tasks.db — matches backend AgentTask */
export type AgentTaskStatus = 'pending' | 'running' | 'in_review' | 'done' | 'failed' | 'blocked';

/** Maps backend AgentTaskStatus → Ionic color */
export function statusColor(status: AgentTaskStatus): 'warning' | 'medium' | 'danger' | 'success' | 'tertiary' {
  switch (status) {
    case 'running':   return 'warning';
    case 'pending':   return 'medium';
    case 'in_review': return 'tertiary';
    case 'done':      return 'success';
    case 'failed':    return 'danger';
    case 'blocked':   return 'danger';
    default:          return 'medium';
  }
}

export interface AgentTask {
  id: string;
  title: string;
  description?: string;
  status: AgentTaskStatus;
  task_type: string;
  priority: number;
  model?: string;
  model_used?: string;
  vault_note?: string;
  tags?: string;
  output?: string;
  error?: string;
  created_at: string | number;
  updated_at: string | number;
  created_at_iso?: string;
  updated_at_iso?: string;
  review_due?: number;
  parent_id?: string;
  parent_task_id?: string;
  children?: AgentTask[];
}

/** Safely parse a task timestamp that may be an ISO string or a Unix epoch (seconds or ms) */
export function parseTaskDate(ts?: string | number): Date {
  if (!ts) return new Date(0);
  if (typeof ts === 'string') return new Date(ts);
  // Unix seconds (< year 3000 threshold) vs milliseconds
  return ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
}

export interface AgentTaskPatch {
  title?: string;
  description?: string;
  status?: 'pending' | 'running' | 'in_review' | 'blocked';
  priority?: number;
  vault_note?: string;
}

export interface NewTaskPayload {
  title: string;
  description?: string;
  task_type: string;
  priority?: number;
  parent_id?: string;
  tags?: string;
  vault_link?: string;
}

export interface ApprovalItem {
  id: number;
  task_id: string;
  action: string;
  payload: string;
  created_at: string;
}

export interface ThreadEvent {
  ts: string;
  tool_call?: { name: string; args: Record<string, unknown> };
  tool_result?: { name: string; result: unknown; confidence?: number };
  tip?: string;
  task_id?: string;
}

export interface QueueStats {
  total: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  db_path: string;
}

export interface HaikuEntry {
  id: string;
  haiku_text: string;  // newline-separated 3 lines (5-7-5)
  source_doc?: string;
  session_date?: string;
  vote_count: number;
  created_at: number;
}
