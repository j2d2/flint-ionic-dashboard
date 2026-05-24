import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonMenuButton,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  closeCircleOutline,
  gitBranchOutline,
  layersOutline,
  refreshOutline,
} from 'ionicons/icons';
import { AgentTask, parseTaskDate } from '../models/agent-task.model';

interface ProposalGroup {
  app: string;
  appLabel: string;
  proposals: AgentTask[];
}

const APP_LABELS: Record<string, string> = {
  'flint-ionic-dashboard': 'Flint Hive Dashboard',
  'flint-app-chore-games': 'Chore Games',
  'flint-dream-logs': 'Dream Logs',
};

const APP_COLORS: Record<string, string> = {
  'flint-ionic-dashboard': 'primary',
  'flint-app-chore-games': 'success',
  'flint-dream-logs': 'tertiary',
};

@Component({
  selector: 'app-approvals',
  templateUrl: './approvals.page.html',
  styleUrls: ['./approvals.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonBadge,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonLabel,
    IonMenuButton,
    IonRefresher,
    IonRefresherContent,
    IonSkeletonText,
    IonText,
    IonTitle,
    IonToolbar,
  ],
})
export class ApprovalsPage implements OnInit {
  readonly proposals = signal<AgentTask[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly actionPending = signal<Set<string>>(new Set());

  readonly groups = computed<ProposalGroup[]>(() => {
    const map = new Map<string, AgentTask[]>();
    for (const p of this.proposals()) {
      const app = this.extractApp(p.tags);
      if (!map.has(app)) map.set(app, []);
      map.get(app)!.push(p);
    }
    return Array.from(map.entries())
      .map(([app, proposals]) => ({
        app,
        appLabel: APP_LABELS[app] ?? app,
        proposals,
      }))
      .sort((a, b) => a.appLabel.localeCompare(b.appLabel));
  });

  readonly totalCount = computed(() => this.proposals().length);

  private readonly http = inject(HttpClient);

  constructor() {
    addIcons({
      checkmarkCircleOutline,
      closeCircleOutline,
      gitBranchOutline,
      layersOutline,
      refreshOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.http.get<{ items: AgentTask[] }>('/api/proposals').subscribe({
      next: ({ items }) => {
        this.proposals.set(items);
        this.isLoading.set(false);
      },
      error: (e: Error) => {
        this.error.set(e.message ?? 'Failed to load proposals');
        this.isLoading.set(false);
      },
    });
  }

  approve(id: string): void {
    this.setActionPending(id, true);
    this.http.post<unknown>(`/api/proposals/${id}/approve`, {}).subscribe({
      next: () => {
        this.proposals.update(ps => ps.filter(p => p.id !== id));
        this.setActionPending(id, false);
      },
      error: () => this.setActionPending(id, false),
    });
  }

  reject(id: string): void {
    this.setActionPending(id, true);
    this.http.post<unknown>(`/api/proposals/${id}/reject`, {}).subscribe({
      next: () => {
        this.proposals.update(ps => ps.filter(p => p.id !== id));
        this.setActionPending(id, false);
      },
      error: () => this.setActionPending(id, false),
    });
  }

  handleRefresh(event: Event): void {
    this.load();
    const el = event.target as HTMLIonRefresherElement;
    setTimeout(() => el.complete(), 600);
  }

  appColor(app: string): string {
    return APP_COLORS[app] ?? 'medium';
  }

  formatDate(ts: string | number): string {
    const d = parseTaskDate(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  isActionPending(id: string): boolean {
    return this.actionPending().has(id);
  }

  private setActionPending(id: string, pending: boolean): void {
    this.actionPending.update(s => {
      const next = new Set(s);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  private extractApp(tags?: string): string {
    if (!tags) return 'unknown';
    for (const raw of tags.split(',')) {
      const tag = raw.trim();
      if (tag.startsWith('flint-') || APP_LABELS[tag]) return tag;
    }
    return 'unknown';
  }
}
