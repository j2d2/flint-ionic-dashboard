import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { AgentTask, statusColor } from '../models/agent-task.model';
import { NewThreadModalComponent } from '../new-thread/new-thread-modal.component';
import { SocketService } from '../services/socket.service';
import { TaskService } from '../services/task.service';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-agent-tasks-page',
  templateUrl: './agent-tasks.page.html',
  styleUrls: ['./agent-tasks.page.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule],
  providers: [DatePipe],
})
export class AgentTasksPage implements OnInit, OnDestroy {
  readonly tasks = signal<AgentTask[]>([]);
  readonly total = signal(0);
  readonly isLoading = signal(false);
  readonly isLoadingMore = signal(false);
  readonly filter = signal<'active' | 'all'>('active');
  readonly sortBy = signal<'priority' | 'updated'>('priority');

  private offset = 0;
  private allLoaded = false;

  readonly filteredTasks = computed(() => {
    const list =
      this.filter() === 'all'
        ? this.tasks()
        : this.tasks().filter((t) => t.status !== 'done');
    if (this.sortBy() === 'updated') {
      return [...list].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    }
    // Default: ascending priority (P1 first), then newest-updated as tiebreaker
    return [...list].sort(
      (a, b) => a.priority - b.priority ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  });

  readonly statusColor = statusColor;

  priorityColor(p: number): string {
    if (p <= 1) return 'danger';
    if (p === 2) return 'warning';
    if (p === 3) return 'medium';
    return 'light';
  }

  priorityLabel(p: number): string {
    return `P${p}`;
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
        this.tasks.update((list) =>
          list.map((t) => (t.id === updated.id ? updated : t))
        );
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
    this.filter.set(value as 'active' | 'all');
  }

  async openNewAgentTask(taskId = 'ad-hoc'): Promise<void> {
    const modal = await this.modalController.create({
      component: NewThreadModalComponent,
      componentProps: { taskId },
      breakpoints: [0, 0.7, 1],
      initialBreakpoint: 0.7,
    });
    await modal.present();
  }

  goToChat(): void {
    void this.router.navigate(['/chat']);
  }

  openTask(taskId: string): void {
    void this.router.navigate(['/task', taskId]);
  }

  formatDate(isoDate?: string): string {
    if (!isoDate) return '-';
    return this.datePipe.transform(isoDate, 'MMM d, h:mm a') ?? isoDate;
  }
}
