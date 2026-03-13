/**
 * AgentTask — maps directly from tasks.db `tasks` table columns.
 * Full DB schema:
 *   id, title, description, status, priority, task_type, tags,
 *   vault_note, vault_link, parent_task_id, review_due, output,
 *   model_used, confidence, archived_at, created_at, updated_at,
 *   started_at, completed_at
 */
export interface AgentTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'blocked';
  priority: number;             // 1 (low) – 5 (urgent)
  task_type: string;            // fast | standard | deep | code | agent_task | session_task | …
  tags?: string;                // comma-separated
  vault_note?: string;          // vault-relative path to task's tracking doc
  vault_link?: string;          // vault-relative path to reference doc
  parent_task_id?: string;
  review_due: number;           // 1 = awaiting human approval, 0 = queued
  output?: string;
  model_used?: string;
  confidence?: number;
  archived_at?: number;
  created_at: number;           // unix timestamp
  updated_at: number;
  started_at?: number;
  completed_at?: number;
  // ISO string versions (added by list_agent_tasks response)
  created_at_iso?: string;
  updated_at_iso?: string;
  started_at_iso?: string;
  completed_at_iso?: string;
}

export interface AgentTaskPatch {
  title?: string;
  description?: string;
  status?: 'pending' | 'running' | 'blocked';  // done/failed require update_task_status
  priority?: number;
  task_type?: string;
  tags?: string;
  vault_note?: string;
  vault_link?: string;
}

export interface ApprovalItem {
  id: string;
  taskId: string;
  title: string;
  summary: string;
  source: string;               // tags field — pipeline that produced this
  consequentialAction: string;  // 'vault_write' | 'task_queue_insert' | etc.
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  vaultLink?: string;
}

export interface ApprovalResult {
  approved: number;
  rejected: number;
  failed: number;
}

export interface FlushResult {
  committed: number;
  dry_run: boolean;
  message?: string;
}

export interface ThreadEvent {
  type: 'tool_call' | 'tool_result' | 'tip' | 'question' | 'next_step';
  taskId: string;
  threadId?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: Record<string, unknown>;
  confidence?: number;
  model?: string;
  tip?: string;
  text?: string;
  timestamp: string;
}

export interface TaskTodo {
  id: string;
  task_id: string;
  text: string;
  status: 'not-started' | 'in-progress' | 'completed' | 'blocked';
  position: number;
}

export interface NewTaskPayload {
  title: string;
  description?: string;
  priority?: number;
  task_type?: string;
  tags?: string;
  vault_link?: string;
  review_due?: boolean;
}
