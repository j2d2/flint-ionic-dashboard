import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface DaemonStatus {
  is_running: boolean;
  pid: number | null;
  heartbeat_ts: number | null;
  heartbeat_age_seconds: number | null;
}

export interface QueueStats {
  blocked: number;
  done: number;
  in_review: number;
  pending: number;
  running: number;
}

export interface SurveyPlanItem {
  ref: string;
  phase: number;
  action: string;
  task_id: string;
  title: string;
  rationale: string;
  est_minutes: number;
  db_id_short?: string;
}

export interface SurveyPlan {
  plan_id: string;
  generated_at: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_at?: string;
  queue_stats: QueueStats;
  items: SurveyPlanItem[];
  flags: string[];
  improvements?: string[];
  claude_cost_usd?: number;
  claude_model?: string;
  claude_tokens_in?: number;
  claude_tokens_out?: number;
}

export interface CommandResult {
  ok: boolean;
  output?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class DaemonService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/daemon';

  getStatus(): Observable<DaemonStatus> {
    return this.http.get<DaemonStatus>(`${this.base}/status`);
  }

  getPlan(): Observable<SurveyPlan> {
    return this.http.get<SurveyPlan>(`${this.base}/plan`);
  }

  approvePlan(): Observable<CommandResult> {
    return this.http.post<CommandResult>(`${this.base}/plan/approve`, {});
  }

  rejectPlan(): Observable<CommandResult> {
    return this.http.post<CommandResult>(`${this.base}/plan/reject`, {});
  }

  startDaemon(): Observable<CommandResult> {
    return this.http.post<CommandResult>(`${this.base}/start`, {});
  }

  stopDaemon(): Observable<CommandResult> {
    return this.http.post<CommandResult>(`${this.base}/stop`, {});
  }

  forceReSurvey(): Observable<CommandResult> {
    return this.http.post<CommandResult>(`${this.base}/survey`, {});
  }

  /** Returns an Observable that emits log lines via SSE (pass auth token for EventSource). */
  streamLogs(token: string): Observable<string> {
    return new Observable<string>(observer => {
      const es = new EventSource(`/api/daemon/logs?token=${encodeURIComponent(token)}`);
      es.onmessage = (evt) => observer.next(JSON.parse(evt.data) as string);
      es.onerror   = () => { observer.error('SSE connection error'); es.close(); };
      return () => es.close();
    });
  }
}
