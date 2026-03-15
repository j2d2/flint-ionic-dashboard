import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonSelect,
  IonSelectOption, IonTextarea, IonTitle, IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { AgentTask } from '../models/agent-task.model';
import { Channel, DEFAULT_CHANNELS } from '../models/channel.model';
import { TaskService } from '../services/task.service';

export type ModalMode = 'task' | 'thread';

@Component({
  selector: 'app-new-thread-modal',
  templateUrl: './new-thread-modal.component.html',
  styleUrls: ['./new-thread-modal.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule,
    IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonSelect,
    IonSelectOption, IonTextarea, IonTitle, IonToolbar,
  ],
})
export class NewThreadModalComponent implements OnInit {
  readonly mode = input<ModalMode>('task');
  readonly taskId = input('ad-hoc');
  readonly channelId = input<string | undefined>(undefined);
  readonly threadStarted = output<string>();

  readonly isSubmitting = signal(false);
  title = '';
  description = '';
  taskType = 'standard';
  channel = 'inbox';

  readonly channels: Channel[] = DEFAULT_CHANNELS;

  readonly taskTypes = [
    { value: 'standard', label: 'Standard Agent' },
    { value: 'code', label: 'Code Agent' },
    { value: 'research', label: 'Research Agent' },
    { value: 'deep', label: 'Deep Analysis' },
  ];

  get modalTitle(): string {
    return this.mode() === 'thread' ? 'New Thread' : 'New Agent Task';
  }

  get submitLabel(): string {
    if (this.isSubmitting()) return 'Creating…';
    return this.mode() === 'thread' ? 'Start Thread' : 'Create Task';
  }

  private readonly modalController = inject(ModalController);
  private readonly taskService = inject(TaskService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    if (this.channelId()) this.channel = this.channelId()!;
    if (this.channel === 'code') this.taskType = 'code';
    else if (this.channel === 'research') this.taskType = 'research';
  }

  onChannelChange(): void {
    if (this.channel === 'code') this.taskType = 'code';
    else if (this.channel === 'research') this.taskType = 'research';
    else this.taskType = 'standard';
  }

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
    const tags = `channel:${this.channel}`;

    this.taskService
      .createTask({
        title: cleanTitle,
        description: this.description.trim() || undefined,
        task_type: this.taskType,
        tags,
      })
      .subscribe({
        next: (task: AgentTask) => {
          this.threadStarted.emit(task.id);
          if (this.mode() === 'thread') {
            void this.dismiss({ task });
            void this.router.navigate(['/task', task.id]);
          } else {
            void this.dismiss({ task });
          }
        },
        error: () => this.isSubmitting.set(false),
        complete: () => this.isSubmitting.set(false),
      });
  }
}

