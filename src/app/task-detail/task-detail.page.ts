import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, ModalController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chatbubbleOutline, documentTextOutline, leafOutline, openOutline } from 'ionicons/icons';

import { AgentTask, HaikuEntry, parseTaskDate, statusColor } from '../models/agent-task.model';
import { MarkdownPipe } from '../pipes/markdown.pipe';
import { VaultDocViewerComponent } from '../shared/vault-doc-viewer/vault-doc-viewer.component';
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
  readonly haiku = signal<HaikuEntry | null>(null);
  readonly isProcessing = signal(false);
  readonly sessionTasks = signal<AgentTask[]>([]);

  readonly statusColor = statusColor;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private readonly toastController = inject(ToastController);
  private readonly modalController = inject(ModalController);
  private readonly datePipe = inject(DatePipe);

  ngOnInit(): void {
    const taskId = this.route.snapshot.paramMap.get('id');
    if (!taskId) return;

    this.taskService.getTaskFull(taskId).subscribe((result) => {
      this.task.set(result.task);
      this.sessionTasks.set(result.session_tasks ?? []);
      if (result.task.vault_note) {
        this.taskService.getVaultDoc(taskId).subscribe({
          next: (r) => this.vaultMarkdown.set(r.markdown),
          error: () => this.vaultMarkdown.set(null),
        });
        this.taskService.getTaskHaiku(taskId).subscribe({
          next: (r) => this.haiku.set(r.haiku),
          error: () => undefined,
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

  async openVaultViewer(): Promise<void> {
    const t = this.task();
    if (!t?.vault_note) return;
    const modal = await this.modalController.create({
      component: VaultDocViewerComponent,
      componentProps: { vaultNotePath: t.vault_note },
    });
    await modal.present();
  }

  startThread(): void {
    const t = this.task();
    if (!t) return;
    void this.router.navigate(['/chat'], {
      state: { taskId: t.id, taskTitle: t.title, vaultMarkdown: this.vaultMarkdown() },
    });
  }

  openTask(id: string): void {
    void this.router.navigate(['/task', id]);
  }

  constructor() {
    addIcons({ documentTextOutline, openOutline, chatbubbleOutline, leafOutline });
  }

  formatDate(ts?: string | number): string {
    if (!ts) return '-';
    const d = parseTaskDate(ts);
    return this.datePipe.transform(d, 'MMM d, h:mm a') ?? String(ts);
  }

  frontmatterEntries(): [string, unknown][] {
    const fm = this.frontmatter();
    return fm ? Object.entries(fm) : [];
  }
}
