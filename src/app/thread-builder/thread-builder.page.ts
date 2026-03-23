import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonInput,
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
  addOutline,
  buildOutline,
  checkmarkDoneOutline,
  closeOutline,
  documentTextOutline,
  flashOutline,
  gitBranchOutline,
  personOutline,
  sparklesOutline,
} from 'ionicons/icons';

export interface BuilderTurn {
  turn_id: string;
  turn_number: number;
  branch: string;
  timestamp: string;
  prompt: string;
  response: string;
}

/** Minimal metadata returned by /start and GET /:id */
export interface ThreadMeta {
  thread_id: string;
  vault_path: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: 'draft' | 'complete';
  turn_count: number;
}

const STORAGE_KEY = 'flint_active_thread_id';

@Component({
  selector: 'app-thread-builder',
  templateUrl: './thread-builder.page.html',
  styleUrls: ['./thread-builder.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonBadge,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonChip,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonInput,
    IonLabel,
    IonMenuButton,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
})
export class ThreadBuilderPage implements OnInit {
  // ── Form fields as signals (OnPush-safe, tracked by computed()) ──────────
  readonly titleValue = signal('');
  readonly promptValue = signal('');
  readonly responseValue = signal('');

  // ── Signals ──────────────────────────────────────────────────────────────
  readonly turns = signal<BuilderTurn[]>([]);
  readonly threadId = signal<string | null>(null);
  readonly meta = signal<ThreadMeta | null>(null);
  readonly isStarting = signal(false);
  readonly isAddingTurn = signal(false);
  readonly isFinalizing = signal(false);
  readonly isLoadingDraft = signal(false);
  readonly isForkingTurnNumber = signal<number | null>(null);
  readonly finalizedPath = signal<string | null>(null);
  readonly forkedResult = signal<{ thread_id: string; vault_path: string; title: string; forked_from_turn: number } | null>(null);
  readonly error = signal<string | null>(null);

  readonly canAddTurn = computed(() =>
    this.promptValue().trim().length > 0 &&
    this.responseValue().trim().length > 0 &&
    !this.isAddingTurn() &&
    this.threadId() !== null &&
    this.finalizedPath() === null
  );

  readonly canFinalize = computed(() =>
    this.turns().length > 0 &&
    !this.isFinalizing() &&
    this.finalizedPath() === null
  );

  readonly canStart = computed(() =>
    this.titleValue().trim().length > 0 &&
    !this.isStarting() && this.threadId() === null
  );

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      addOutline,
      buildOutline,
      checkmarkDoneOutline,
      closeOutline,
      documentTextOutline,
      flashOutline,
      gitBranchOutline,
      personOutline,
      sparklesOutline,
    });
  }

  // ── Phase 2: resume draft on init ────────────────────────────────────────
  ngOnInit(): void {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;

    this.isLoadingDraft.set(true);
    this.http.get<{ meta: ThreadMeta; turns: BuilderTurn[] }>(`/api/thread-builder/${savedId}`)
      .subscribe({
        next: ({ meta, turns }) => {
          if (meta.status === 'complete') {
            // Draft was already finalized — clear localStorage but don't auto-load it
            localStorage.removeItem(STORAGE_KEY);
            this.isLoadingDraft.set(false);
            return;
          }
          this.threadId.set(meta.thread_id);
          this.meta.set(meta);
          this.turns.set(turns);
          this.titleValue.set(meta.title === 'Untitled Thread' ? '' : meta.title);
          this.isLoadingDraft.set(false);
        },
        error: () => {
          // Draft not found (server restarted?) — start fresh
          localStorage.removeItem(STORAGE_KEY);
          this.isLoadingDraft.set(false);
        },
      });
  }

  // ── Start thread ─────────────────────────────────────────────────────────
  startThread(): void {
    if (!this.canStart()) return;
    this.isStarting.set(true);
    this.error.set(null);

    const title = this.titleValue().trim() || 'Untitled Thread';
    this.http.post<{ thread_id: string; vault_path: string; title: string }>(
      '/api/thread-builder/start',
      { title }
    ).subscribe({
      next: ({ thread_id, vault_path, title: savedTitle }) => {
        this.threadId.set(thread_id);
        this.meta.set({
          thread_id,
          vault_path,
          title: savedTitle,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: 'draft',
          turn_count: 0,
        });
        localStorage.setItem(STORAGE_KEY, thread_id);
        this.isStarting.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? err?.message ?? 'Failed to start thread');
        this.isStarting.set(false);
      },
    });
  }

  // ── Add turn ─────────────────────────────────────────────────────────────
  addTurn(): void {
    if (!this.canAddTurn()) return;
    this.isAddingTurn.set(true);
    this.error.set(null);

    const id = this.threadId()!;
    const prompt = this.promptValue();
    const response = this.responseValue();

    this.http.post<{ turn_id: string; turn_number: number; turn_count: number }>(
      `/api/thread-builder/${id}/turn`,
      { prompt, response }
    ).subscribe({
      next: ({ turn_id, turn_number }) => {
        this.turns.update(t => [
          ...t,
          { turn_id, turn_number, branch: 'main', timestamp: new Date().toISOString(), prompt, response },
        ]);
        this.promptValue.set('');
        this.responseValue.set('');
        this.isAddingTurn.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? err?.message ?? 'Failed to add turn');
        this.isAddingTurn.set(false);
      },
    });
  }

  // ── Finalize ─────────────────────────────────────────────────────────────
  finalize(): void {
    if (!this.canFinalize()) return;
    this.isFinalizing.set(true);
    this.error.set(null);

    const id = this.threadId()!;
    this.http.post<{ vault_path: string; status: string; turn_count: number }>(
      `/api/thread-builder/${id}/finalize`,
      {}
    ).subscribe({
      next: ({ vault_path }) => {
        this.finalizedPath.set(vault_path);
        localStorage.removeItem(STORAGE_KEY);
        this.isFinalizing.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? err?.message ?? 'Failed to finalize thread');
        this.isFinalizing.set(false);
      },
    });
  }

  // ── Reset / new thread ───────────────────────────────────────────────────
  reset(): void {
    this.threadId.set(null);
    this.meta.set(null);
    this.turns.set([]);
    this.finalizedPath.set(null);
    this.forkedResult.set(null);
    this.error.set(null);
    this.titleValue.set('');
    this.promptValue.set('');
    this.responseValue.set('');
    localStorage.removeItem(STORAGE_KEY);
  }

  // ── Fork from a turn ─────────────────────────────────────────────────────
  forkFromTurn(turnNumber: number): void {
    const id = this.threadId();
    if (!id) return;

    this.isForkingTurnNumber.set(turnNumber);
    this.error.set(null);
    this.forkedResult.set(null);

    this.http.post<{ thread_id: string; vault_path: string; title: string; forked_from_turn: number }>(
      `/api/thread-builder/${id}/fork`,
      { after_turn: turnNumber }
    ).subscribe({
      next: (result) => {
        this.forkedResult.set(result);
        this.isForkingTurnNumber.set(null);
      },
      error: (err) => {
        this.error.set(err?.error?.error ?? err?.message ?? 'Failed to fork thread');
        this.isForkingTurnNumber.set(null);
      },
    });
  }

  openVault(): void {
    void this.router.navigate(['/vault']);
  }

  preview(text: string, max = 200): string {
    return text.length > max ? text.slice(0, max) + '…' : text;
  }
}
