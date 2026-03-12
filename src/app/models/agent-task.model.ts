export type AgentTaskStatus = 'running' | 'idle' | 'error' | 'complete';

export interface AgentTask {
  id: string;
  name: string;
  status: AgentTaskStatus;
  agentType: string;
  model: string;
  lastRun: string;
  nextRun?: string;
  logs: string[];
  threadId?: string;
  vaultOutputPath?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentThread {
  id: string;
  taskId: string;
  prompt: string;
  startedAt: string;
  status: 'active' | 'complete' | 'error';
}
