import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';

import { AgentTask, AgentTaskStatus } from '../models/agent-task.model';
import { NewThreadModalComponent } from '../new-thread/new-thread-modal.component';
import { TaskService } from '../services/task.service';

@Component({
  selector: 'app-task-detail-page',
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
  providers: [DatePipe],
})
export class TaskDetailPage implements OnInit {
  readonly task = signal<AgentTask | null>(null);

  private readonly route = inject(ActivatedRoute);
  private readonly taskService = inject(TaskService);
  private readonly modalController = inject(ModalController);
  private readonly datePipe = inject(DatePipe);

  ngOnInit(): void {
    const taskId = this.route.snapshot.paramMap.get('id');
    if (!taskId) {
      return;
    }

    this.taskService.getTask(taskId).subscribe((task) => {
      this.task.set(task ?? null);
    });
  }

  async startNewThread(): Promise<void> {
    const currentTask = this.task();
    const modal = await this.modalController.create({
      component: NewThreadModalComponent,
      componentProps: { taskId: currentTask?.id ?? 'ad-hoc' },
      breakpoints: [0, 0.7, 1],
      initialBreakpoint: 0.7,
    });
    await modal.present();
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

  formatRunTime(isoDate?: string): string {
    if (!isoDate) {
      return '-';
    }
    return this.datePipe.transform(isoDate, 'MMM d, h:mm a') ?? isoDate;
  }
}
