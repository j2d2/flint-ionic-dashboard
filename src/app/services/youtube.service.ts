import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ProposedTask,
  QueueTasksResult,
  YoutubeAnalysisResult,
} from '../models/youtube.model';

@Injectable({ providedIn: 'root' })
export class YoutubeService {
  private readonly http = inject(HttpClient);

  analyze(url: string): Observable<YoutubeAnalysisResult> {
    return this.http.post<YoutubeAnalysisResult>('/api/youtube/analyze', { url });
  }

  queueTasks(
    tasks: ProposedTask[],
    videoId: string,
    videoTitle: string,
  ): Observable<QueueTasksResult> {
    return this.http.post<QueueTasksResult>('/api/youtube/queue-tasks', {
      tasks,
      video_id: videoId,
      video_title: videoTitle,
    });
  }
}
