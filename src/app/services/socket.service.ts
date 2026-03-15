import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { AgentTask, ThreadEvent } from '../models/agent-task.model';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  private readonly taskUpdate$ = new Subject<AgentTask>();
  private readonly approvalUpdate$ = new Subject<void>();
  private readonly threadEvent$ = new Subject<ThreadEvent>();

  constructor(private readonly ngZone: NgZone) {}

  connect(): void {
    if (this.socket?.connected) {
      return;
    }
    // Run socket.io entirely outside Angular's zone so that incoming WebSocket
    // events do NOT trigger change detection. We re-enter the zone explicitly
    // via ngZone.run() only when pushing data into Subjects — this is the only
    // point where Angular needs to know something changed.
    this.ngZone.runOutsideAngular(() => {
      this.socket = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
      this.socket.on('task:update', (task: AgentTask) =>
        this.ngZone.run(() => this.taskUpdate$.next(task))
      );
      this.socket.on('approval:update', () =>
        this.ngZone.run(() => this.approvalUpdate$.next())
      );
      this.socket.on('thread:event', (evt: ThreadEvent) =>
        this.ngZone.run(() => this.threadEvent$.next(evt))
      );
    });
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
