import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
// NOTE: We intentionally use @Input() setters + internal WritableSignal instead of Angular's
// input() signal API here. Ionic's ModalController sets componentProps via direct property
// assignment (instance.mode = 'task'), which shadows the signal getter on the prototype and
// turns it into a plain string — so this.mode() throws "not a function". Angular's
// ComponentRef.setInput() (which *would* correctly feed signal inputs) is not used by Ionic's
// overlay system. The setter bridge below is the correct workaround.
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel,
  IonSelect, IonSelectOption, IonTextarea, IonTitle, IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

export interface WrapperMeta {
  name: string;
  description: string;
  trigger: string;
  agent: string;
  mode: string;
  template: string;
}

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
    FormsModule,
    IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel,
    IonSelect, IonSelectOption, IonTextarea, IonTitle, IonToolbar,
  ],
})
export class NewThreadModalComponent implements OnInit {
  // Internal signals — use these throughout the component.
  private readonly _mode = signal<ModalMode>('task');
  private readonly _taskId = signal('ad-hoc');
  private readonly _channelId = signal<string | undefined>(undefined);

  // Readonly views exposed to the template.
  readonly mode = this._mode.asReadonly();
  readonly taskId = this._taskId.asReadonly();
  readonly channelId = this._channelId.asReadonly();

  // @Input() setters bridge Ionic's direct property assignment into the signals.
  // DO NOT replace these with input() — see comment at top of file.
  @Input('mode') set modeInput(val: ModalMode) { this._mode.set(val); }
  @Input('taskId') set taskIdInput(val: string) { this._taskId.set(val); }
  @Input('channelId') set channelIdInput(val: string | undefined) { this._channelId.set(val ?? undefined); }

  @Output() threadStarted = new EventEmitter<string>();

  readonly isSubmitting = signal(false);
  title = '';
  description = '';
  taskType = 'standard';
  channel = 'inbox';
  vaultLink = '';

  /** Vault doc preview state */
  readonly vaultPreview = signal<{ title: string; found: boolean } | null>(null);
  readonly vaultLinkChecking = signal(false);

  /** Duplicate task detection */
  readonly duplicateTask = signal<{ id: string; title: string; status: string } | null>(null);
  readonly duplicateConfirmed = signal(false);

  private vaultDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private titleDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly channels: Channel[] = DEFAULT_CHANNELS;

  readonly taskTypes = [
    { value: 'standard', label: 'Standard Agent' },
    { value: 'code', label: 'Code Agent' },
    { value: 'research', label: 'Research Agent' },
    { value: 'deep', label: 'Deep Analysis' },
  ];

  /** Prompt wrapper templates */
  readonly wrappers = signal<WrapperMeta[]>([]);
  selectedWrapper = '';

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
  private readonly http = inject(HttpClient);

  ngOnInit(): void {
    if (this.channelId()) this.channel = this.channelId()!;
    if (this.channel === 'code') this.taskType = 'code';
    else if (this.channel === 'research') this.taskType = 'research';
    this.loadWrappers();
  }

  loadWrappers(): void {
    this.http.get<{ wrappers: WrapperMeta[] }>('/api/wrappers').subscribe({
      next: (res) => this.wrappers.set(res.wrappers),
      error: () => {},
    });
  }

  onWrapperChange(): void {
    if (!this.selectedWrapper) return;
    const w = this.wrappers().find(x => x.name === this.selectedWrapper);
    if (!w) return;
    // Pre-fill description with the wrapper template (user replaces {{user_input}})
    if (!this.description.trim()) {
      this.description = w.template;
    }
    // Map wrapper agent type to task type
    if (w.agent === 'code' || w.mode === 'refactor') this.taskType = 'code';
    else if (w.mode === 'research' || w.mode === 'planning-review') this.taskType = 'research';
    else if (w.mode === 'deep') this.taskType = 'deep';
    else this.taskType = 'standard';
  }

  onChannelChange(): void {
    if (this.channel === 'code') this.taskType = 'code';
    else if (this.channel === 'research') this.taskType = 'research';
    else this.taskType = 'standard';
  }

  onVaultLinkChange(): void {
    const path = this.vaultLink.trim();
    if (this.vaultDebounceTimer) clearTimeout(this.vaultDebounceTimer);
    if (!path) { this.vaultPreview.set(null); return; }

    this.vaultDebounceTimer = setTimeout(() => {
      this.vaultLinkChecking.set(true);
      this.http.get<{ path: string; title: string; has_frontmatter: boolean }>(
        `/api/vault/preview?path=${encodeURIComponent(path)}`
      ).subscribe({
        next: (res) => {
          this.vaultPreview.set({ title: res.title, found: true });
          // Auto-fill title only if user hasn't typed one yet
          if (!this.title.trim() && res.title) {
            this.title = res.title;
            this.checkDuplicate(res.title);
          }
          this.vaultLinkChecking.set(false);
        },
        error: () => {
          this.vaultPreview.set({ title: '', found: false });
          this.vaultLinkChecking.set(false);
        },
      });
    }, 400);
  }

  onTitleChange(): void {
    this.duplicateConfirmed.set(false);
    const title = this.title.trim();
    if (this.titleDebounceTimer) clearTimeout(this.titleDebounceTimer);
    if (title.length < 3) { this.duplicateTask.set(null); return; }
    this.titleDebounceTimer = setTimeout(() => this.checkDuplicate(title), 500);
  }

  private checkDuplicate(title: string): void {
    this.http.get<{ tasks: { id: string; title: string; status: string }[] }>(
      `/api/tasks/search?title=${encodeURIComponent(title)}`
    ).subscribe({
      next: (res) => this.duplicateTask.set(res.tasks[0] ?? null),
      error: () => this.duplicateTask.set(null),
    });
  }

  confirmDuplicate(): void {
    this.duplicateConfirmed.set(true);
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
    if (this.duplicateTask() && !this.duplicateConfirmed()) return;

    this.isSubmitting.set(true);
    const tags = `channel:${this.channel}`;
    const vaultLink = this.vaultLink.trim() || undefined;

    this.taskService
      .createTask({
        title: cleanTitle,
        description: this.description.trim() || undefined,
        task_type: this.taskType,
        tags,
        vault_link: vaultLink,
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

