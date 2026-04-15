import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons,
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonChip, IonCol,
  IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonRow,
  IonText, IonTextarea, IonTitle, IonToolbar,
  ModalController, ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { addOutline, chatbubbleOutline, closeOutline, documentTextOutline, gitBranchOutline, leafOutline, openOutline, sparklesOutline } from 'ionicons/icons';

import { AgentTask, HaikuEntry, PlanExecuteResult, parseTaskDate, statusColor } from '../models/agent-task.model';
import { MarkdownPipe } from '../pipes/markdown.pipe';
import { VaultDocViewerComponent } from '../shared/vault-doc-viewer/vault-doc-viewer.component';
import { TaskService } from '../services/task.service';
import { ThreadService } from '../services/thread.service';

@Component({
  selector: 'app-task-detail-page',
  templateUrl: './task-detail.page.html',
  styleUrls: ['./task-detail.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons,
    IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonChip, IonCol,
    IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonRow,
    IonText, IonTextarea, IonTitle, IonToolbar,
    MarkdownPipe,
  ],
  providers: [DatePipe],
})
export class TaskDetailPage implements OnInit {
  readonly task = signal<AgentTask | null>(null);
  readonly frontmatter = signal<Record<string, unknown> | null>(null);
  readonly vaultMarkdown = signal<string | null>(null);
  readonly haiku = signal<HaikuEntry | null>(null);
  readonly isProcessing = signal(false);
  readonly isSubmittingReview = signal(false);
  readonly isFinalizing = signal(false);
  readonly sessionTasks = signal<AgentTask[]>([]);

  // ─── Sonnet 4.6 confirm-before-send signals ───
  readonly sonnetPreviewPrompt = signal<string | null>(null);
  readonly editablePrompt = signal('');
  readonly isPlanningWithClaude = signal(false);
  readonly planResult = signal<PlanExecuteResult | null>(null);

  // ─── Add-to-Thread panel signals ───
  readonly addToThreadPanel = signal(false);
  readonly threadTurnPrompt = signal('');
  readonly threadTurnResponse = signal('');
  readonly isAddingToThread = signal(false);
  readonly addToThreadError = signal<string | null>(null);

  readonly statusColor = statusColor;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private readonly threadService = inject(ThreadService);
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
          next: (r) => {
            // Defer the heavy marked.parse() + DomSanitizer call so it doesn't
            // block first paint of the detail page.
            setTimeout(() => this.vaultMarkdown.set(r.markdown), 0);
          },
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
        // Set up Sonnet confirm panel if server returned a preview prompt
        if (res.sonnet_preview_prompt) {
          this.sonnetPreviewPrompt.set(res.sonnet_preview_prompt);
          this.editablePrompt.set(res.sonnet_preview_prompt);
        }
        const toast = await this.toastController.create({
          message: res.sonnet_preview_prompt ? 'Vault doc created — review prompt below' : 'Task queued for processing',
          duration: 2500,
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

  /** Submit agent_task for review — moves status to in_review. */
  async submitForReview(): Promise<void> {
    const t = this.task();
    if (!t || this.isSubmittingReview()) return;
    this.isSubmittingReview.set(true);
    this.taskService.submitForReview(t.id).subscribe({
      next: async (updated) => {
        this.task.set(updated);
        const toast = await this.toastController.create({
          message: 'Task submitted for review',
          duration: 2000,
          color: 'tertiary',
        });
        await toast.present();
      },
      error: async () => {
        const toast = await this.toastController.create({
          message: 'Failed to submit for review',
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      },
      complete: () => this.isSubmittingReview.set(false),
    });
  }

  /** Finalize agent_task as done — cascades done to all session_task children. */
  async finalizeTask(): Promise<void> {
    const t = this.task();
    if (!t || this.isFinalizing()) return;
    this.isFinalizing.set(true);
    this.taskService.finalizeTask(t.id).subscribe({
      next: async (res) => {
        if (res.task) this.task.set(res.task);
        else this.task.update((prev) => prev ? { ...prev, status: 'done' } : prev);
        // Reflect cascade in session list
        this.sessionTasks.update((list) =>
          list.map((st) => st.status !== 'done' ? { ...st, status: 'done' as const } : st)
        );
        const msg = res.cascaded_children > 0
          ? `Done! ${res.cascaded_children} thread(s) also closed.`
          : 'Task finalized as done';
        const toast = await this.toastController.create({
          message: msg,
          duration: 3000,
          color: 'success',
        });
        await toast.present();
      },
      error: async (err) => {
        const detail = err?.error?.error ?? 'Failed to finalize task';
        const toast = await this.toastController.create({
          message: detail,
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      },
      complete: () => this.isFinalizing.set(false),
    });
  }

  /** Start Thread: creates a persisted session_task, then opens chat within that thread context. */
  async startThread(): Promise<void> {
    const t = this.task();
    if (!t) return;
    this.taskService.startThread(t.id).subscribe({
      next: (sessionTask) => {
        // Refresh session list
        this.sessionTasks.update((prev) => [sessionTask, ...prev]);
        void this.router.navigate(['/chat'], {
          state: {
            taskId: t.id,
            taskTitle: t.title,
            sessionTaskId: sessionTask.id,
            sessionTaskTitle: sessionTask.title,
            vaultMarkdown: this.vaultMarkdown(),
          },
        });
      },
      error: async () => {
        const toast = await this.toastController.create({
          message: 'Could not create thread',
          duration: 2000,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  /** Chat: ephemeral — no session_task created, direct to chat with task context only. */
  openChat(): void {
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
    addIcons({ addOutline, chatbubbleOutline, closeOutline, documentTextOutline, gitBranchOutline, leafOutline, openOutline, sparklesOutline });
  }

  /** Open the Add-to-Thread panel, pre-filling the prompt with the task title. */
  openAddToThreadPanel(): void {
    const t = this.task();
    if (!t) return;
    this.threadTurnPrompt.set(t.title ?? '');
    this.threadTurnResponse.set('');
    this.addToThreadError.set(null);
    this.addToThreadPanel.set(true);
  }

  /** POST the turn to the active thread-builder thread stored in localStorage. */
  async addToThread(): Promise<void> {
    const threadId = localStorage.getItem('flint_active_thread_id');
    if (!threadId) {
      const toast = await this.toastController.create({
        message: 'No active thread — open Thread Builder and start one first',
        duration: 3000,
        color: 'warning',
      });
      await toast.present();
      return;
    }
    const prompt = this.threadTurnPrompt().trim();
    const response = this.threadTurnResponse().trim();
    if (!prompt || !response) {
      this.addToThreadError.set('Both prompt and response are required');
      return;
    }
    this.isAddingToThread.set(true);
    this.addToThreadError.set(null);
    this.threadService.addTurn(threadId, prompt, response).subscribe({
      next: async ({ turn_number }) => {
        this.addToThreadPanel.set(false);
        this.threadTurnPrompt.set('');
        this.threadTurnResponse.set('');
        this.isAddingToThread.set(false);
        const toast = await this.toastController.create({
          message: `Turn ${turn_number} added to thread`,
          duration: 2500,
          color: 'success',
        });
        await toast.present();
      },
      error: async (err) => {
        this.addToThreadError.set(err?.error?.error ?? err?.message ?? 'Failed to add turn');
        this.isAddingToThread.set(false);
      },
    });
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

  /** Send the (optionally edited) prompt to Claude Sonnet 4.6 and display the result. */
  async runWithClaude(): Promise<void> {
    const t = this.task();
    if (!t || this.isPlanningWithClaude()) return;
    const prompt = this.editablePrompt().trim();
    this.isPlanningWithClaude.set(true);
    this.taskService.planTask(t.id, prompt || undefined).subscribe({
      next: async (result) => {
        this.planResult.set(result);
        this.sonnetPreviewPrompt.set(null);
        this.task.update((prev) => prev ? { ...prev, status: 'done' } : prev);
        if (result.vault_note) {
          // Refresh vault markdown with the patched Output section
          this.taskService.getVaultDoc(t.id).subscribe({
            next: (r) => setTimeout(() => this.vaultMarkdown.set(r.markdown), 0),
            error: () => undefined,
          });
        }
        const toast = await this.toastController.create({
          message: 'Claude responded — result saved to vault',
          duration: 3000,
          color: 'primary',
        });
        await toast.present();
      },
      error: async (err) => {
        const detail = err?.error?.error ?? 'Claude API call failed';
        const toast = await this.toastController.create({
          message: detail,
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      },
      complete: () => this.isPlanningWithClaude.set(false),
    });
  }
}
