import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';

import { TaskService } from '../services/task.service';

@Component({
  selector: 'app-new-thread-modal',
  templateUrl: './new-thread-modal.component.html',
  styleUrls: ['./new-thread-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class NewThreadModalComponent {
  @Input() taskId = 'ad-hoc';
  @Output() threadStarted = new EventEmitter<string>();

  readonly isSubmitting = signal(false);
  title = '';
  description = '';
  taskType = 'standard';

  readonly taskTypes = [
    { value: 'standard', label: 'Standard Agent' },
    { value: 'code', label: 'Code Agent' },
    { value: 'research', label: 'Research Agent' },
    { value: 'deep', label: 'Deep Analysis' },
  ];

  private readonly modalController = inject(ModalController);
  private readonly taskService = inject(TaskService);
  private readonly router = inject(Router);

  async dismiss(data?: unknown): Promise<void> {
    const wasModalDismissed = await this.modalController.dismiss(data);
    if (!wasModalDismissed) {
      void this.router.navigate(['/dashboard']);
    }
  }

  submit(): void {
    const cleanTitle = this.title.trim();
    if (!cleanTitle || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.taskService
      .createTask({
        title: cleanTitle,
        description: this.description.trim() || undefined,
        task_type: this.taskType,
      })
      .subscribe({
        next: (task) => {
          this.threadStarted.emit(task.id);
          void this.dismiss({ taskId: task.id });
          void this.router.navigate(['/task', task.id]);
        },
        error: () => this.isSubmitting.set(false),
        complete: () => this.isSubmitting.set(false),
      });
  }
}

