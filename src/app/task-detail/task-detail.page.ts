import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';

import { AgentTask, statusColor } from '../models/agent-task.model';
import { NewThreadModalComponent } from '../new-thread/new-thread-modal.component';
import { MarkdownPipe } from '../pipes/markdown.pipe';
import { TaskService } from '../services/task.service';

@Component({
  selector: 'app-task-detail-page',
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule, MarkdownPipe],
  providers: [DatePipe],
})
export class TaskDetailPage implements OnInit {
  readonly task = signal<AgentTask | null>(null);
  readonly frontmatter = signal<Record<string, unknown> | null>(null);
  readonly vaultMarkdown = signal<string | null>(null);
  readonly isProcessing = signal(false);
  readonly vaultDocOpen = signal(false);

  readonly statusColor = statusColor;

  private readonly route = inject(ActivatedRoute);
  private readonly taskService = inject(TaskService);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly datePipe = inject(DatePipe);

  ngOnInit(): void {
    const taskId = this.route.snapshot.paramMap.get('id');
    if (!taskId) return;

    this.taskService.getTask(taskId).subscribe((task) => {
      this.task.set(task);
      // Load vault doc if available
      if (task.vault_note) {
        this.taskService.getVaultDoc(taskId).subscribe({
          next: (r) => this.vaultMarkdown.set(r.markdown),
          error: () => this.vaultMarkdown.set(null),
        });
      }
    });

    this.taskService.getTaskFrontmatter(taskId).subscribe({
      next: (fm) => this.frontmatter.set((fm as any)?.frontmatter ?? fm),
      error: () => this.frontmatter.set(null),
    });
  }

  async processTask(): Promise<void> {
    const t = this.task();
    if (!t || this.isProcessing()) return;
    this.isProcessing.set(true);
    this.taskService.processTask(t.id).subscribe({
      next: async (res) => {
        this.task.update((prev) => prev ? { ...prev, vault_note: res.vault_note, review_due: res.review_due } : prev);
        const toast = await this.toastController.create({
          message: 'Task queued for processing',
          duration: 2000,
          color: 'success',
        });
        await toast.present();
      },
      error: async () => {
        const toast = await this.toastController.create({
          message: 'Failed to process task',
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      },
      complete: () => this.isProcessing.set(false),
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

  formatDate(isoDate?: string): string {
    if (!isoDate) return '-';
    return this.datePipe.transform(isoDate, 'MMM d, h:mm a') ?? isoDate;
  }

  frontmatterEntries(): [string, unknown][] {
    const fm = this.frontmatter();
    return fm ? Object.entries(fm) : [];
  }
}
