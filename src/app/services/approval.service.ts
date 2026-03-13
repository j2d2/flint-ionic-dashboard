import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApprovalItem } from '../models/agent-task.model';

export interface BulkApproveResult {
  approved: number;
  rejected: number;
}

export interface FlushResult {
  flushed?: number;
  dry_run?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApprovalService {
  private readonly http = inject(HttpClient);

  getPending(): Observable<{ approvals: ApprovalItem[] }> {
    return this.http.get<{ approvals: ApprovalItem[] }>('/api/approvals');
  }

  bulkApprove(approveIds: number[], rejectIds: number[]): Observable<BulkApproveResult> {
    return this.http.post<BulkApproveResult>('/api/approvals/bulk', {
      approve_ids: approveIds,
      reject_ids: rejectIds,
    });
  }

  flush(dryRun = false): Observable<FlushResult> {
    return this.http.post<FlushResult>('/api/approvals/flush', { dry_run: dryRun });
  }
}
