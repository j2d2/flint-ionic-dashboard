import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import {
  AgentTask,
  AgentTaskPatch,
  NewTaskPayload,
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

  processTask(id: string): Observable<{ vault_note: string; review_due: number }> {
    return this.http.post<{ vault_note: string; review_due: number }>(
      `/api/tasks/${id}/process`,
      {}
    );
  }

  sendChat(id: string, message: string): Observable<{ task_id: string }> {
    return this.http.post<{ task_id: string }>(`/api/tasks/${id}/chat`, { message });
  }
}

