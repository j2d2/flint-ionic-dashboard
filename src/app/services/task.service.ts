import { Injectable } from '@angular/core';
import { Observable, delay, map, of } from 'rxjs';

import { AgentTask } from '../models/agent-task.model';

const MOCK_TASKS: AgentTask[] = [
  {
    id: 'task-1',
    name: 'Repo Health Digest',
    status: 'running',
    agentType: 'analysis',
    model: 'qwen3:8b',
    lastRun: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    nextRun: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    logs: ['Bootstrapping analysis graph', 'Evaluating dependency drift'],
    metadata: { repo: 'openclaw-mcp' },
  },
  {
    id: 'task-2',
    name: 'Vault Triage Queue',
    status: 'idle',
    agentType: 'operations',
    model: 'gemma3:4b',
    lastRun: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    logs: ['Queue drained'],
    metadata: { queueDepth: 0 },
  },
  {
    id: 'task-3',
    name: 'Release Notes Draft',
    status: 'complete',
    agentType: 'release',
    model: 'qwen2.5-coder:14b',
    lastRun: new Date(Date.now() - 95 * 60 * 1000).toISOString(),
    logs: ['Collected commits', 'Drafted release note summary'],
    metadata: { version: '0.6.0' },
  },
];

@Injectable({ providedIn: 'root' })
export class TaskService {
  getTasks(): Observable<AgentTask[]> {
    return of(MOCK_TASKS).pipe(delay(120));
  }

  getTask(id: string): Observable<AgentTask | undefined> {
    return this.getTasks().pipe(map((tasks) => tasks.find((task) => task.id === id)));
  }
}
