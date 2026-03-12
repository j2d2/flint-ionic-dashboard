import { Injectable } from '@angular/core';
import { EMPTY, Observable } from 'rxjs';

import { AgentTask } from '../models/agent-task.model';

@Injectable({ providedIn: 'root' })
export class SocketService {
  connect(): void {
    // Phase 2: wire Socket.io client to environment.wsUrl.
  }

  onTaskUpdate(): Observable<AgentTask> {
    return EMPTY;
  }

  disconnect(): void {
    // Phase 2: tear down socket connection.
  }
}
