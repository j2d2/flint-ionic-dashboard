import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { AgentTask, ThreadEvent } from '../models/agent-task.model';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly taskUpdate$ = new Subject<AgentTask>();
  private readonly approvalUpdate$ = new Subject<void>();
  private readonly threadEvent$ = new Subject<ThreadEvent>();

  connect(): void {
    if (this.socket?.connected) {
      return;
    }
    this.socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    this.socket.on('task:update', (task: AgentTask) => this.taskUpdate$.next(task));
    this.socket.on('approval:update', () => this.approvalUpdate$.next());
    this.socket.on('thread:event', (evt: ThreadEvent) => this.threadEvent$.next(evt));
  }

  onTaskUpdate(): Observable<AgentTask> {
    return this.taskUpdate$.asObservable();
  }

  onApprovalUpdate(): Observable<void> {
    return this.approvalUpdate$.asObservable();
  }

  onThreadEvent(): Observable<ThreadEvent> {
    return this.threadEvent$.asObservable();
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
