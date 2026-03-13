import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { AgentTask, statusColor } from '../models/agent-task.model';
import { NewThreadModalComponent } from '../new-thread/new-thread-modal.component';
import { SocketService } from '../services/socket.service';
import { TaskService } from '../services/task.service';

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule],
  providers: [DatePipe],
})
export class DashboardPage implements OnInit, OnDestroy {
  readonly tasks = signal<AgentTask[]>([]);
  readonly isLoading = signal(false);
  readonly filter = signal<'active' | 'all'>('active');

  readonly filteredTasks = computed(() =>
    this.filter() === 'all'
      ? this.tasks()
      : this.tasks().filter((t) => t.status !== 'done')
  );

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
    this.isLoading.set(true);
    this.taskService.getTasks().subscribe({
      next: (tasks) => this.tasks.set(tasks),
      complete: () => {
        this.isLoading.set(false);
        event?.detail.complete();
      },
    });
  }

  async openNewThread(taskId = 'ad-hoc'): Promise<void> {
    const modal = await this.modalController.create({
      component: NewThreadModalComponent,
      componentProps: { taskId },
      breakpoints: [0, 0.7, 1],
      initialBreakpoint: 0.7,
    });
    await modal.present();
  }

  openTask(taskId: string): void {
    void this.router.navigate(['/task', taskId]);
  }

  formatDate(isoDate?: string): string {
    if (!isoDate) return '-';
    return this.datePipe.transform(isoDate, 'MMM d, h:mm a') ?? isoDate;
  }
}

