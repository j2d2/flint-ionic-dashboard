/** Statuses from the real tasks.db — matches backend AgentTask */
export type AgentTaskStatus = 'pending' | 'running' | 'done' | 'failed' | 'blocked';

/** Maps backend AgentTaskStatus → Ionic color */
export function statusColor(status: AgentTaskStatus): 'warning' | 'medium' | 'danger' | 'success' {
  switch (status) {
    case 'running':  return 'warning';
    case 'pending':  return 'medium';
    case 'done':     return 'success';
    case 'failed':   return 'danger';
    case 'blocked':  return 'danger';
    default:         return 'medium';
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
  vault_note?: string;
  tags?: string;
  output?: string;
  error?: string;
  created_at: string;
  updated_at: string;
  review_due?: number;
  parent_id?: string;
  children?: AgentTask[];
}

export interface AgentTaskPatch {
  title?: string;
  description?: string;
  status?: 'pending' | 'running' | 'blocked';
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
