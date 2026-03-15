import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  HaikuEntry,
  HaikuListResponse,
  HaikuPairResult,
} from '../models/haiku.model';

@Injectable({ providedIn: 'root' })
export class HaikuService {
  private readonly http = inject(HttpClient);

  getLeaderboard(
    sort: 'votes' | 'newest' = 'votes',
    limit = 20,
    offset = 0,
  ): Observable<HaikuListResponse> {
    const params = new HttpParams()
      .set('sort', sort)
      .set('limit', String(limit))
      .set('offset', String(offset));
    return this.http.get<HaikuListResponse>('/api/haikus', { params });
  }

  getVotePair(voterId: string): Observable<HaikuPairResult> {
    const params = new HttpParams().set('voter_id', voterId);
    return this.http.get<HaikuPairResult>('/api/haikus/pair', { params });
  }

  vote(haikuId: string, voterId: string, choreId?: string): Observable<{
    status: 'voted' | 'already_voted';
    vote_count: number;
    haiku_id: string;
  }> {
    return this.http.post<{ status: 'voted' | 'already_voted'; vote_count: number; haiku_id: string }>(
      `/api/haikus/${haikuId}/vote`,
      { voter_id: voterId, chore_id: choreId ?? null },
    );
  }
}
