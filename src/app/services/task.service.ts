import { HttpClient } from '@angular/common/http';
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

  getTasks(): Observable<AgentTask[]> {
    return this.http
      .get<{ tasks: AgentTask[] }>('/api/tasks')
      .pipe(map((r) => r.tasks));
  }

  getTask(id: string): Observable<AgentTask> {
    return this.http.get<AgentTask>(`/api/tasks/${id}`);
  }

  getTaskFrontmatter(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/api/tasks/${id}/frontmatter`);
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
