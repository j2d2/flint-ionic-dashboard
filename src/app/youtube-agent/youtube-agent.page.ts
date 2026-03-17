import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  chatbubblesOutline,
  ellipseOutline,
  flashOutline,
  libraryOutline,
  logoYoutube,
  ribbonOutline,
  warningOutline,
} from 'ionicons/icons';

import {
  ProposedTask,
  QueueTasksResult,
  YoutubeAnalysisResult,
} from '../models/youtube.model';
import { YoutubeService } from '../services/youtube.service';

interface Stage {
  label: string;
  active: boolean;
  done: boolean;
}

@Component({
  selector: 'app-youtube-agent',
  templateUrl: './youtube-agent.page.html',
  styleUrls: ['./youtube-agent.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonBadge,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonCheckbox,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class YoutubeAgentPage implements OnDestroy {
  private readonly youtubeService = inject(YoutubeService);
  private readonly router = inject(Router);

  readonly url = signal('');
  readonly isLoading = signal(false);
  readonly error = signal('');
  readonly result = signal<YoutubeAnalysisResult | null>(null);
  readonly selectedTaskIds = signal(new Set<string>());
  readonly isQueuing = signal(false);
  readonly queueResult = signal<QueueTasksResult | null>(null);

  readonly stages = signal<Stage[]>([
    { label: 'Fetching video transcript', active: false, done: false },
    { label: 'Building intelligence brief', active: false, done: false },
    { label: 'Generating haiku', active: false, done: false },
    { label: 'Proposing swarm tasks', active: false, done: false },
  ]);

  private stageTimers: ReturnType<typeof setTimeout>[] = [];

  readonly haikuLines = computed(() =>
    (this.result()?.haiku ?? '').split('\n').filter((l) => l.trim()),
  );

  readonly hasReferences = computed(() => {
    const refs = this.result()?.brief.references;
    if (!refs) return false;
    return (
      (refs.urls?.length ?? 0) > 0 ||
      (refs.books?.length ?? 0) > 0 ||
      (refs.people?.length ?? 0) > 0 ||
      (refs.tools_and_products?.length ?? 0) > 0 ||
      (refs.concepts?.length ?? 0) > 0
    );
  });

  constructor() {
    addIcons({ logoYoutube, flashOutline, checkmarkCircleOutline, ellipseOutline, ribbonOutline, warningOutline, chatbubblesOutline, libraryOutline });
  }

  openInChat(): void {
    const r = this.result();
    if (!r) return;
    // Build markdown context to inject into the chat thread
    const lines: string[] = [
      `## ${r.brief.title ?? r.video_id}`,
      `**Channel:** ${r.brief.channel ?? 'Unknown'}`,
      '',
      `**TL;DR:** ${r.brief.tldr ?? ''}`,
      '',
    ];
    if (r.brief.key_takeaways?.length) {
      lines.push('**Key Takeaways:**');
      r.brief.key_takeaways.forEach(t => lines.push(`- ${t}`));
      lines.push('');
    }
    if (r.vault_path) {
      lines.push(`**Vault doc:** ${r.vault_path}`);
    }
    this.router.navigate(['/chat'], {
      state: {
        taskTitle: r.brief.title ?? r.video_id,
        vaultMarkdown: lines.join('\n'),
      },
    });
  }

  ngOnDestroy(): void {
    this.clearStageTimers();
  }

  analyze(): void {
    const rawUrl = this.url().trim();
    if (!rawUrl || this.isLoading()) return;

    this.error.set('');
    this.result.set(null);
    this.queueResult.set(null);
    this.selectedTaskIds.set(new Set());
    this.isLoading.set(true);
    this.startStageProgress();

    this.youtubeService.analyze(rawUrl).subscribe({
      next: (data) => {
        this.finishStages();
        this.result.set(data);
        this.isLoading.set(false);
      },
      error: (err: { error?: { error?: string }; message?: string }) => {
        this.clearStageTimers();
        this.stages.set(this.stages().map((s) => ({ ...s, active: false })));
        this.error.set(
          err?.error?.error ?? err?.message ?? 'Analysis failed.',
        );
        this.isLoading.set(false);
      },
    });
  }

  toggleTask(task: ProposedTask): void {
    const id = task.id ?? task.title;
    this.selectedTaskIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  queueSelected(): void {
    const res = this.result();
    if (!res || this.isQueuing()) return;

    const allTasks = res.proposed_tasks ?? [];
    const ids = this.selectedTaskIds();
    const toQueue = allTasks.filter(
      (t) => ids.has(t.id ?? t.title),
    );
    if (toQueue.length === 0) return;

    this.isQueuing.set(true);
    this.youtubeService
      .queueTasks(toQueue, res.video_id, res.brief.title)
      .subscribe({
        next: (r) => {
          this.queueResult.set(r);
          this.isQueuing.set(false);
          this.selectedTaskIds.set(new Set());
        },
        error: (err: { error?: { error?: string }; message?: string }) => {
          this.error.set(
            err?.error?.error ?? err?.message ?? 'Failed to queue tasks.',
          );
          this.isQueuing.set(false);
        },
      });
  }

  formatDuration(secs: number): string {
    if (!secs) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  priorityColor(priority?: number): string {
    if (priority === 1) return 'medium';
    if (priority === 3) return 'danger';
    return 'warning';
  }

  taskTypeColor(type?: string): string {
    const map: Record<string, string> = {
      research: 'primary',
      build_prototype: 'tertiary',
      verify_claim: 'warning',
      compare: 'secondary',
      find_resource: 'success',
    };
    return map[type ?? ''] ?? 'medium';
  }

  // ---------------------------------------------------------------------------
  // Stage progress helpers
  // ---------------------------------------------------------------------------

  private startStageProgress(): void {
    this.clearStageTimers();
    this.stages.set([
      { label: 'Fetching video transcript', active: true, done: false },
      { label: 'Building intelligence brief', active: false, done: false },
      { label: 'Generating haiku', active: false, done: false },
      { label: 'Proposing swarm tasks', active: false, done: false },
    ]);

    this.stageTimers.push(
      setTimeout(() => {
        this.stages.update((s) =>
          s.map((stage, i) =>
            i === 0
              ? { ...stage, done: true, active: false }
              : i === 1
                ? { ...stage, active: true }
                : stage,
          ),
        );
      }, 8_000),
    );

    this.stageTimers.push(
      setTimeout(() => {
        this.stages.update((s) =>
          s.map((stage, i) =>
            i === 1
              ? { ...stage, done: true, active: false }
              : i === 2
                ? { ...stage, active: true }
                : stage,
          ),
        );
      }, 35_000),
    );

    this.stageTimers.push(
      setTimeout(() => {
        this.stages.update((s) =>
          s.map((stage, i) =>
            i === 2
              ? { ...stage, done: true, active: false }
              : i === 3
                ? { ...stage, active: true }
                : stage,
          ),
        );
      }, 40_000),
    );
  }

  private finishStages(): void {
    this.clearStageTimers();
    this.stages.update((s) => s.map((stage) => ({ ...stage, done: true, active: false })));
  }

  private clearStageTimers(): void {
    this.stageTimers.forEach((t) => clearTimeout(t));
    this.stageTimers = [];
  }
}
