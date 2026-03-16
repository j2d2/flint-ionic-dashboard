import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import {
  AgentTask,
  AgentTaskPatch,
  HaikuEntry,
  NewTaskPayload,
  PlanExecuteResult,
  QueueStats,
} from '../models/agent-task.model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  getTasks(offset = 0, limit = 50): Observable<{ tasks: AgentTask[]; total: number }> {
    const params = new HttpParams()
      .set('offset', String(offset))
      .set('limit', String(limit));
    return this.http.get<{ tasks: AgentTask[]; total: number }>('/api/tasks', { params });
  }

  getTask(id: string): Observable<AgentTask> {
    return this.http.get<{ task: AgentTask } | AgentTask>(`/api/tasks/${id}`).pipe(
      map((r) => ('task' in r && r.task ? r.task : r as AgentTask))
    );
  }

  getTaskFull(id: string): Observable<{ task: AgentTask; session_tasks: AgentTask[]; total_children: number }> {
    return this.http.get<{ task: AgentTask; session_tasks?: AgentTask[]; total_children?: number }>(`/api/tasks/${id}`).pipe(
      map((r) => ({
        task: r.task ?? (r as unknown as AgentTask),
        session_tasks: r.session_tasks ?? [],
        total_children: r.total_children ?? 0,
      }))
    );
  }

  getTaskFrontmatter(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/api/tasks/${id}/frontmatter`);
  }

  getVaultDoc(id: string): Observable<{ task_id: string; vault_note: string; markdown: string }> {
    return this.http.get<{ task_id: string; vault_note: string; markdown: string }>(
      `/api/tasks/${id}/vault-doc`
    );
  }

  getStats(): Observable<QueueStats> {
    return this.http.get<QueueStats>('/api/tasks/stats');
  }

  createTask(payload: NewTaskPayload): Observable<AgentTask> {
    return this.http.post<AgentTask>('/api/tasks/create', payload);
  }

  patchTask(id: string, patch: AgentTaskPatch): Observable<AgentTask> {
    return this.http.patch<AgentTask>(`/api/tasks/${id}`, patch);
  }

  processTask(id: string): Observable<{ vault_note: string; review_due: number; haiku_pending?: boolean; sonnet_preview_prompt?: string }> {
    return this.http.post<{ vault_note: string; review_due: number; haiku_pending?: boolean; sonnet_preview_prompt?: string }>(
      `/api/tasks/${id}/process`,
      {}
    );
  }

  /** Send the (optionally edited) prompt to Claude Sonnet 4.6 via the /plan endpoint. */
  planTask(id: string, prompt?: string): Observable<PlanExecuteResult> {
    return this.http.post<PlanExecuteResult>(`/api/tasks/${id}/plan`, { prompt });
  }

  /** Move agent_task to in_review — required before finalization. */
  submitForReview(id: string): Observable<AgentTask> {
    return this.http.post<AgentTask>(`/api/tasks/${id}/submit-review`, {});
  }

  /** Mark agent_task done; cascades done to all session_task children. */
  finalizeTask(id: string, output?: string): Observable<{ task_id: string; status: string; cascaded_children: number; task?: AgentTask }> {
    return this.http.post<{ task_id: string; status: string; cascaded_children: number; task?: AgentTask }>(
      `/api/tasks/${id}/finalize`,
      { output }
    );
  }

  sendChat(id: string, message: string): Observable<{ task_id: string }> {
    return this.http.post<{ task_id: string }>(`/api/tasks/${id}/chat`, { message });
  }

  /** Creates a persisted session_task Thread under the parent task. */
  startThread(taskId: string, title?: string): Observable<AgentTask> {
    return this.http.post<AgentTask>(`/api/tasks/${taskId}/threads`, { title });
  }

  getTaskHaiku(id: string): Observable<{ haiku: HaikuEntry | null }> {
    return this.http.get<{ haiku: HaikuEntry | null }>(`/api/tasks/${id}/haiku`);
  }
}

