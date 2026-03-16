import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import {
  IonBadge, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonFabList,
  IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem,
  IonLabel, IonList, IonMenuButton, IonNote, IonPopover, IonRefresher,
  IonRefresherContent, IonSearchbar, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';

import { AgentTask, parseTaskDate, statusColor } from '../models/agent-task.model';
import { ChipScrollComponent } from '../shared/chip-scroll/chip-scroll.component';
import { NewThreadModalComponent } from '../new-thread/new-thread-modal.component';
import { SocketService } from '../services/socket.service';
import { TaskService } from '../services/task.service';
import { addIcons } from 'ionicons';
import { addOutline, chatbubbleEllipsesOutline, documentOutline, documentTextOutline, flashOutline, gitBranchOutline, searchOutline, timeOutline, trendingUpOutline } from 'ionicons/icons';

const PAGE_SIZE = 200;

@Component({
  selector: 'app-agent-tasks-page',
  templateUrl: './agent-tasks.page.html',
  styleUrls: ['./agent-tasks.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterModule,
    IonBadge, IonButton, IonButtons, IonContent, IonFab, IonFabButton, IonFabList,
    IonHeader, IonIcon, IonInfiniteScroll, IonInfiniteScrollContent, IonItem,
    IonLabel, IonList, IonMenuButton, IonNote, IonPopover, IonRefresher,
    IonRefresherContent, IonSearchbar, IonSegment, IonSegmentButton, IonTitle, IonToolbar,
    ChipScrollComponent,
  ],
  providers: [DatePipe],
})
export class AgentTasksPage implements OnInit, OnDestroy {
  readonly tasks = signal<AgentTask[]>([]);
  readonly total = signal(0);
  readonly isLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly filter = signal<'active' | 'all' | 'review'>(
    (localStorage.getItem('agent-tasks:filter') as 'active' | 'all' | 'review') ?? 'active'
  );
  readonly sortBy = signal<'priority' | 'updated'>('updated');
  readonly searchOpen = signal(false);
  readonly searchQuery = signal('');
  readonly activeTagFilter = signal<string | null>(null);

  readonly sortLabel = computed(() => this.sortBy() === 'updated' ? 'Recent' : 'Priority');
  readonly reviewDueCount = computed(() => this.tasks().filter((t) => t.status === 'in_review' || t.review_due === 1).length);
  readonly allTags = computed(() => {
    const seen = new Set<string>();
    for (const t of this.tasks()) {
      if (t.tags) this.parseTags(t.tags).forEach((s) => seen.add(s));
    }
    return Array.from(seen).sort();
  });

  /** Parse tags stored as CSV or JSON array (e.g. '["foo","bar"]' or 'foo,bar') */
  parseTags(raw: string): string[] {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
      } catch { /* fall through to CSV */ }
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  }

  private offset = 0;
  private allLoaded = false;

  readonly filteredTasks = computed(() => {
    const f = this.filter();
    const q = this.searchQuery().trim().toLowerCase();
    const activeTag = this.activeTagFilter();
    let list =
      f === 'all' ? this.tasks() :
      f === 'review' ? this.tasks().filter((t) => t.status === 'in_review' || t.review_due === 1) :
      this.tasks().filter((t) => t.status !== 'done');
    if (q) {
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.task_type ?? '').toLowerCase().includes(q)
      );
    }
    if (activeTag) {
      list = list.filter((t) =>
        t.tags ? this.parseTags(t.tags).includes(activeTag) : false
      );
    }
    // Pre-compute timestamps once per item so parseTaskDate() is called O(n)
    // rather than O(n log n) times inside the comparator.
    const tsMap = new Map(
      list.map((t) => [t.id, parseTaskDate(t.updated_at_iso ?? t.updated_at).getTime()])
    );
    if (this.sortBy() === 'updated') {
      return [...list].sort((a, b) => tsMap.get(b.id)! - tsMap.get(a.id)!);
    }
    // Default: ascending priority (P1 first), then newest-updated as tiebreaker
    return [...list].sort(
      (a, b) => a.priority - b.priority || tsMap.get(b.id)! - tsMap.get(a.id)!
    );
  });

  readonly statusColor = statusColor;

  constructor() {
    addIcons({ documentTextOutline, addOutline, searchOutline, trendingUpOutline, timeOutline, flashOutline, gitBranchOutline, chatbubbleEllipsesOutline });
  }

  priorityColor(p: number): string {
    if (p <= 1) return 'danger';
    if (p === 2) return 'warning';
    if (p === 3) return 'medium';
    return 'light';
  }

  priorityLabel(p: number): string {
    return `P${p}`;
  }

  /** e.g. "Projects/Tasks/my-task-doc.md" → "my-task-doc" */
  vaultNoteLabel(vaultNote: string): string {
    const base = vaultNote.split('/').pop() ?? vaultNote;
    return base.endsWith('.md') ? base.slice(0, -3) : base;
  }

  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private readonly socketService = inject(SocketService);
  private readonly modalController = inject(ModalController);
  private readonly datePipe = inject(DatePipe);
  private readonly subs = new Subscription();

  ngOnInit(): void {
    this.loadTasks();
    this.socketService.connect();
    this.subs.add(
      this.socketService.onTaskUpdate().subscribe((updated) => {
        this.tasks.update((list) => {
          const idx = list.findIndex((t) => t.id === updated.id);
          if (idx >= 0) {
            const next = [...list];
            next[idx] = updated;
            return next;
          }
          // New task — prepend and bump total
          this.total.update((n) => n + 1);
          return [updated, ...list];
        });
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  loadTasks(event?: CustomEvent): void {
    this.offset = 0;
    this.allLoaded = false;
    this.isLoading.set(true);
    this.taskService.getTasks(0, PAGE_SIZE).subscribe({
      next: ({ tasks, total }) => {
        this.tasks.set(tasks);
        this.total.set(total);
        this.offset = tasks.length;
        this.allLoaded = tasks.length >= total;
      },
      complete: () => {
        this.isLoading.set(false);
        (event as any)?.detail?.complete();
      },
    });
  }

  loadMore(event: CustomEvent): void {
    if (this.allLoaded) {
      (event as any).target.complete();
      (event as any).target.disabled = true;
      return;
    }
    this.isLoadingMore.set(true);
    this.taskService.getTasks(this.offset, PAGE_SIZE).subscribe({
      next: ({ tasks, total }) => {
        this.tasks.update((prev) => {
          // Merge, avoid duplicates by id
          const existing = new Set(prev.map((t) => t.id));
          return [...prev, ...tasks.filter((t) => !existing.has(t.id))];
        });
        this.total.set(total);
        this.offset += tasks.length;
        this.allLoaded = this.tasks().length >= total;
        (event as any).target.complete();
        if (this.allLoaded) (event as any).target.disabled = true;
      },
      complete: () => this.isLoadingMore.set(false),
    });
  }

  onFilterChange(value: string): void {
    const v = value as 'active' | 'all' | 'review';
    localStorage.setItem('agent-tasks:filter', v);
    this.filter.set(v);
  }

  toggleSearch(): void {
    this.searchOpen.update((v) => !v);
    if (!this.searchOpen()) this.searchQuery.set('');
  }

  toggleTagFilter(tag: string): void {
    this.activeTagFilter.update((current) => current === tag ? null : tag);
  }

  async openNewAgentTask(): Promise<void> {
    const modal = await this.modalController.create({
      component: NewThreadModalComponent,
      componentProps: { mode: 'task' },
      breakpoints: [0, 0.7, 1],
      initialBreakpoint: 0.7,
    });
    await modal.present();
    const { data } = await modal.onDidDismiss<{ task?: AgentTask }>();
    if (data?.task) {
      // Prepend immediately — socket may also broadcast; dedup handles it
      this.tasks.update((list) => {
        if (list.some((t) => t.id === data.task!.id)) return list;
        this.total.update((n) => n + 1);
        return [data.task!, ...list];
      });
    }
  }

  async openNewThread(): Promise<void> {
    const modal = await this.modalController.create({
      component: NewThreadModalComponent,
      componentProps: { mode: 'thread' },
      breakpoints: [0, 0.8, 1],
      initialBreakpoint: 0.8,
    });
    await modal.present();
  }

  goToChat(): void {
    void this.router.navigate(['/chat']);
  }

  openTask(taskId: string): void {
    void this.router.navigate(['/task', taskId]);
  }

  formatDate(ts?: string | number): string {
    if (!ts) return '-';
    const d = parseTaskDate(ts);
    return this.datePipe.transform(d, 'MMM d, h:mm a') ?? String(ts);
  }
}
