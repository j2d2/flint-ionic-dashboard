import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThreadService {
  private readonly http = inject(HttpClient);

  /** Send a chat message to an existing task thread. Returns the new session task id. */
  sendMessage(taskId: string, message: string): Observable<{ task_id: string }> {
    return this.http.post<{ task_id: string }>(`/api/tasks/${taskId}/chat`, { message });
  }

  /** Append a turn to an existing thread-builder thread. */
  addTurn(threadId: string, prompt: string, response: string): Observable<{ turn_id: string; turn_number: number; turn_count: number }> {
    return this.http.post<{ turn_id: string; turn_number: number; turn_count: number }>(
      `/api/thread-builder/${threadId}/turn`,
      { prompt, response },
    );
  }
}
