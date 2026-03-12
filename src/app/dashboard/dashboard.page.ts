import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';

import { AgentTask, AgentTaskStatus } from '../models/agent-task.model';
import { NewThreadModalComponent } from '../new-thread/new-thread-modal.component';
import { TaskService } from '../services/task.service';

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule],
  providers: [DatePipe],
})
export class DashboardPage implements OnInit {
  readonly tasks = signal<AgentTask[]>([]);
  readonly isLoading = signal(false);

  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private readonly modalController = inject(ModalController);
  private readonly datePipe = inject(DatePipe);

  ngOnInit(): void {
    this.loadTasks();
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

  statusColor(status: AgentTaskStatus): 'warning' | 'medium' | 'danger' | 'success' {
    switch (status) {
      case 'running':
        return 'warning';
      case 'idle':
        return 'medium';
      case 'error':
        return 'danger';
      case 'complete':
        return 'success';
      default:
        return 'medium';
    }
  }

  formatRunTime(isoDate: string): string {
    return this.datePipe.transform(isoDate, 'MMM d, h:mm a') ?? isoDate;
  }
}
