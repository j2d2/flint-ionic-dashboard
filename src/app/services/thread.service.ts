import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ThreadService {
  startThread(taskId: string, prompt: string, agentType: string): Observable<{ threadId: string }> {
    const threadId = `${taskId}-${agentType}-${Date.now()}`;
    return of({ threadId }).pipe(delay(prompt.length > 0 ? 250 : 100));
  }
}
