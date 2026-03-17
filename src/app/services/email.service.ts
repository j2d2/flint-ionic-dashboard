import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { InboxSummaryResponse } from '../models/email.model';

@Injectable({ providedIn: 'root' })
export class EmailService {
  private readonly http = inject(HttpClient);

  getSummary(options: { limit?: number; source?: string; refresh?: boolean } = {}): Observable<InboxSummaryResponse> {
    let params = new HttpParams();
    if (options.limit) params = params.set('limit', String(options.limit));
    if (options.source) params = params.set('source', options.source);
    if (options.refresh) params = params.set('refresh', 'true');
    return this.http.get<InboxSummaryResponse>('/api/email/summary', { params });
  }
}
