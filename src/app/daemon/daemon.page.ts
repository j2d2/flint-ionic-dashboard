import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import {
  IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
  IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel,
  IonList, IonMenuButton, IonNote, IonRefresher, IonRefresherContent,
  IonSkeletonText, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline, checkmarkCircleOutline, chevronDownOutline, chevronForwardOutline,
  closeCircleOutline, flashOutline, playOutline, refreshOutline, stopOutline,
  terminalOutline, timeOutline,
} from 'ionicons/icons';

import { AuthService } from '../services/auth.service';
import { DaemonService, DaemonStatus, SurveyPlan, SurveyPlanItem } from '../services/daemon.service';

@Component({
  selector: 'app-daemon-page',
  templateUrl: './daemon.page.html',
  styleUrls: ['./daemon.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader,
    IonCardTitle, IonChip, IonContent, IonHeader, IonIcon, IonItem, IonLabel,
    IonList, IonMenuButton, IonNote, IonRefresher, IonRefresherContent,
    IonSkeletonText, IonTitle, IonToolbar,
  ],
})
export class DaemonPage implements OnInit, OnDestroy {
  private readonly svc     = inject(DaemonService);
  private readonly authSvc = inject(AuthService);

  readonly status    = signal<DaemonStatus | null>(null);
  readonly plan      = signal<SurveyPlan | null>(null);
  readonly planErr   = signal<string | null>(null);
  readonly isLoading = signal(true);
  readonly actionMsg = signal<string | null>(null);
  readonly isActing  = signal(false);
  readonly logsOpen  = signal(false);
  readonly logLines  = signal<string[]>([]);

  flagsOpen = false;
  private logsEs: EventSource | null = null;

  readonly phaseGroups = computed(() => {
    const items = this.plan()?.items ?? [];
    const map = new Map<number, SurveyPlanItem[]>();
    for (const item of items) {
      if (!map.has(item.phase)) map.set(item.phase, []);
      map.get(item.phase)!.push(item);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  });

  readonly totalMinutes = computed(() =>
    (this.plan()?.items ?? []).reduce((s, i) => s + (i.est_minutes ?? 0), 0)
  );

  readonly heartbeatLabel = computed(() => {
    const s = this.status();
    if (!s?.heartbeat_age_seconds) return null;
    const age = s.heartbeat_age_seconds;
    if (age < 60)    return `${age}s ago`;
    if (age < 3600)  return `${Math.round(age / 60)}m ago`;
    return `${Math.round(age / 3600)}h ago`;
  });

  readonly heartbeatStale = computed(() => {
    const age = this.status()?.heartbeat_age_seconds ?? null;
    return age !== null && age > 120; // stale if > 2× poll interval
  });

  constructor() {
    addIcons({
      alertCircleOutline, checkmarkCircleOutline, chevronDownOutline, chevronForwardOutline,
      closeCircleOutline, flashOutline, playOutline, refreshOutline, stopOutline,
      terminalOutline, timeOutline,
    });
    effect(() => {
      if (this.logsOpen()) {
        this.startLogStream();
      } else {
        this.stopLogStream();
      }
    });
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.stopLogStream();
  }

  load(): void {
    this.isLoading.set(true);
    // Load status
    this.svc.getStatus().subscribe({
      next: (s)  => this.status.set(s),
      error: () => {},
    });
    // Load plan
    this.svc.getPlan().subscribe({
      next:  (p) => { this.plan.set(p);   this.planErr.set(null); this.isLoading.set(false); },
      error: (e) => { this.planErr.set(e?.error?.error ?? 'Could not load plan.'); this.isLoading.set(false); },
    });
  }

  onRefresh(evt: any): void {
    this.load();
    setTimeout(() => evt.target.complete(), 800);
  }

  approvePlan(): void {
    this.actionMsg.set(null);
    this.svc.approvePlan().subscribe({
      next:  (r) => { this.actionMsg.set(r.output ?? 'Plan approved.'); this.load(); },
      error: (e) => this.actionMsg.set(e?.error?.error ?? 'Approve failed.'),
    });
  }

  rejectPlan(): void {
    this.actionMsg.set(null);
    this.svc.rejectPlan().subscribe({
      next:  (r) => { this.actionMsg.set(r.output ?? 'Plan rejected. Run flint d survey-force to regenerate.'); this.load(); },
      error: (e) => this.actionMsg.set(e?.error?.error ?? 'Reject failed.'),
    });
  }

  startDaemon(): void {
    this.isActing.set(true);
    this.actionMsg.set(null);
    this.svc.startDaemon().subscribe({
      next:  (r) => { this.actionMsg.set(r.output ?? 'Daemon started.'); this.isActing.set(false); this.load(); },
      error: (e) => { this.actionMsg.set(e?.error?.error ?? 'Start failed.'); this.isActing.set(false); },
    });
  }

  stopDaemon(): void {
    this.isActing.set(true);
    this.actionMsg.set(null);
    this.svc.stopDaemon().subscribe({
      next:  (r) => { this.actionMsg.set(r.output ?? 'Daemon stopped.'); this.isActing.set(false); this.load(); },
      error: (e) => { this.actionMsg.set(e?.error?.error ?? 'Stop failed.'); this.isActing.set(false); },
    });
  }

  forceReSurvey(): void {
    this.isActing.set(true);
    this.actionMsg.set(null);
    this.svc.forceReSurvey().subscribe({
      next:  (r) => { this.actionMsg.set(r.output ?? 'Survey queued. Poll the plan in ~60s.'); this.isActing.set(false); },
      error: (e) => { this.actionMsg.set(e?.error?.error ?? 'Survey failed.'); this.isActing.set(false); },
    });
  }

  toggleLogs(): void {
    this.logsOpen.update(v => !v);
  }

  private startLogStream(): void {
    const token = this.authSvc.token();
    if (!token) return;
    this.logLines.set([]);
    this.logsEs = new EventSource(`/api/daemon/logs?token=${encodeURIComponent(token)}`);
    this.logsEs.onmessage = (evt) => {
      const line = JSON.parse(evt.data) as string;
      this.logLines.update(lines => [...lines.slice(-499), line]);
    };
    this.logsEs.onerror = () => {
      this.stopLogStream();
      this.logsOpen.set(false);
    };
  }

  private stopLogStream(): void {
    this.logsEs?.close();
    this.logsEs = null;
  }

  actionColor(action: string): string {
    switch (action) {
      case 'archive':  return 'medium';
      case 'execute':  return 'primary';
      case 'skip':     return 'warning';
      case 'promote':  return 'success';
      default:         return 'tertiary';
    }
  }

  planStatusColor(status: string): string {
    switch (status) {
      case 'approved': return 'success';
      case 'pending':  return 'warning';
      case 'rejected': return 'danger';
      default:         return 'medium';
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }
}
