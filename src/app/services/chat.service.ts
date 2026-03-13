import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface ChatResponse {
  response: string;
  model?: string;
  should_escalate?: boolean;
  confidence?: number;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);

  chat(prompt: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>('/api/chat', { prompt });
  }
}
