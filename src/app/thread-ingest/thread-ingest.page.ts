import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonLabel,
  IonMenuButton,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';
import { addIcons } from 'ionicons';
import {
  arrowForwardOutline,
  chatbubblesOutline,
  checkmarkCircleOutline,
  closeOutline,
  documentTextOutline,
  flashOutline,
  gitBranchOutline,
  personOutline,
  sparklesOutline,
} from 'ionicons/icons';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  turn_index: number;
  branch_label?: string;
}

export interface IngestResult {
  turns: Turn[];
  task_ids: string[];
  vault_note: string;
  title: string;
  summary: string;
}

@Component({
  selector: 'app-thread-ingest',
  templateUrl: './thread-ingest.page.html',
  styleUrls: ['./thread-ingest.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonLabel,
    IonMenuButton,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
})
export class ThreadIngestPage {
  rawText = '';
  threadTitle = '';
  createTasks = false;

  readonly isIngesting = signal(false);
  readonly isCreatingTask = signal(false);
  readonly result = signal<IngestResult | null>(null);
  readonly createdTaskId = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      arrowForwardOutline,
      chatbubblesOutline,
      checkmarkCircleOutline,
      closeOutline,
      documentTextOutline,
      flashOutline,
      gitBranchOutline,
      personOutline,
      sparklesOutline,
    });
  }

  get canIngest(): boolean {
    return this.rawText.trim().length > 20 && !this.isIngesting();
  }

  ingest(): void {
    if (!this.canIngest) return;
    this.isIngesting.set(true);
    this.error.set(null);
    this.result.set(null);

    this.http.post<IngestResult>('/api/thread-ingest', {
      raw_text: this.rawText.trim(),
      title: this.threadTitle.trim() || undefined,
      create_tasks: this.createTasks,
    }).subscribe({
      next: (res) => {
        this.result.set(res);
        this.isIngesting.set(false);
      },
      error: (err) => {
        const msg = err?.error?.error ?? err?.message ?? 'Unknown error';
        this.error.set(msg);
        this.isIngesting.set(false);
      },
    });
  }

  openTask(id: string): void {
    void this.router.navigate(['/task', id]);
  }

  createAgentTask(): void {
    const res = this.result();
    if (!res || this.isCreatingTask()) return;
    this.isCreatingTask.set(true);

    this.http.post<{ task_id: string }>('/api/thread-ingest/create-task', {
      title: res.title,
      summary: res.summary,
      vault_note: res.vault_note,
      turn_count: res.turns.length,
    }).subscribe({
      next: (r) => {
        this.createdTaskId.set(r.task_id);
        this.isCreatingTask.set(false);
      },
      error: () => this.isCreatingTask.set(false),
    });
  }

  reset(): void {
    this.rawText = '';
    this.threadTitle = '';
    this.result.set(null);
    this.error.set(null);
    this.createdTaskId.set(null);
  }

  /** Collapse long content for the preview */
  preview(text: string, max = 280): string {
    return text.length > max ? text.slice(0, max) + '…' : text;
  }
}
