import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkOutline,
  closeOutline,
  ellipse,
  ellipseOutline,
  mailOutline,
  mailOpenOutline,
  pencilOutline,
  refreshOutline,
  star,
  starOutline,
  warningOutline,
} from 'ionicons/icons';

import { EmailMessage } from '../models/email.model';
import { EmailService } from '../services/email.service';
import { InboxStateService } from '../services/inbox-state.service';

/** Lightweight client-side re-classifier (mirrors Python logic). */
function clientClassify(subject: string, from: string): string | null {
  const s = subject.toLowerCase();
  const f = from.toLowerCase();

  const NEWSLETTER_FROM = ['noreply', 'no-reply', 'donotreply', 'newsletter', 'updates@', 'mailer@', 'notifications@', 'offers@', 'deals@', 'promotions@', 'info@', 'news@'];
  const ACTION = ['action required', 'urgent:', 'time sensitive', 'deadline', 'please review', 'approval needed', 'response needed', 'asap'];
  const NEWSLETTER_SUBJ = ['newsletter', 'unsubscribe', 'weekly deals', 'special offer', 'sale ends', 'limited time', 'off today'];
  const DIGEST = ['digest', 'weekly summary', 'weekly update', 'monthly summary', 'usage digest', 'weekly report', 'daily summary'];

  if (NEWSLETTER_FROM.some(p => f.includes(p))) return 'newsletter';
  if (ACTION.some(p => s.includes(p))) return 'action-required';
  if (NEWSLETTER_SUBJ.some(p => s.includes(p))) return 'newsletter';
  if (DIGEST.some(p => s.includes(p))) return 'digest';
  return null;
}

@Component({
  selector: 'app-inbox',
  templateUrl: 'inbox.page.html',
  styleUrls: ['inbox.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IonBadge,
    IonButton,
    IonButtons,
    IonChip,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonNote,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class InboxPage implements OnInit {
  readonly loading = signal(false);
  readonly errors = signal<string[]>([]);
  readonly fetchedAt = signal<Date | null>(null);
  readonly isCached = signal(false);

  /** Which message is currently open for tag editing. */
  readonly editingMsgId = signal<string | null>(null);
  /** Current value of the inline tag edit input. */
  readonly editTagValue = signal<string>('');

  protected readonly inboxState = inject(InboxStateService);
  private readonly emailService = inject(EmailService);

  /** The account object for the currently selected email address. */
  readonly activeAccount = computed(() => {
    const sel = this.inboxState.selectedAccount();
    return this.inboxState.accounts().find(a => a.account === sel) ?? null;
  });

  constructor() {
    addIcons({
      checkmarkOutline,
      closeOutline,
      ellipse,
      ellipseOutline,
      mailOutline,
      mailOpenOutline,
      pencilOutline,
      refreshOutline,
      star,
      starOutline,
      warningOutline,
    });
  }

  ngOnInit(): void {
    this.load();
  }

  refresh(): void {
    this.load(true);
  }

  load(forceRefresh = false): void {
    this.loading.set(true);
    this.errors.set([]);

    this.emailService.getSummary({ limit: 20, refresh: forceRefresh }).subscribe({
      next: (result) => {
        this.inboxState.setAccounts(result.accounts ?? []);
        this.errors.set(result.errors ?? []);
        this.fetchedAt.set(result.fetched_at ? new Date(result.fetched_at) : new Date());
        this.isCached.set(result._cached ?? false);
        this.loading.set(false);
      },
      error: (err) => {
        this.errors.set([err?.message ?? 'Failed to load inbox']);
        this.loading.set(false);
      },
    });
  }

  // ─── Tag helpers ───────────────────────────────────────────────

  /** Returns the locally-queued tag if present, then the server suggestion. */
  effectiveTag(msgId: string, serverTag: string | null | undefined): string | null {
    return this.inboxState.getLocalTag(msgId) ?? serverTag ?? null;
  }

  isLocallyQueued(msgId: string): boolean {
    return this.inboxState.getLocalTag(msgId) !== undefined;
  }

  // ─── Tag interactions ──────────────────────────────────────────

  /** Quick-apply: save the server suggestion straight to the local queue. */
  applyServerSuggestion(msg: EmailMessage): void {
    const tag = msg.enzo_tag;
    if (tag) this.inboxState.setLocalTag(msg.id, tag);
  }

  /** Re-run client-side classifier, pre-fill and open edit mode. */
  reclassify(msg: EmailMessage): void {
    const reclassified = clientClassify(msg.subject, msg.from);
    this.editTagValue.set(reclassified ?? this.effectiveTag(msg.id, msg.enzo_tag) ?? '');
    this.editingMsgId.set(msg.id);
  }

  /** Open edit mode for a message, pre-filled with current effective tag. */
  startEdit(msg: EmailMessage): void {
    this.editTagValue.set(this.effectiveTag(msg.id, msg.enzo_tag) ?? '');
    this.editingMsgId.set(msg.id);
  }

  /** Save edited value to local queue and close edit mode. */
  confirmEdit(msg: EmailMessage): void {
    const val = this.editTagValue().trim();
    if (val) {
      this.inboxState.setLocalTag(msg.id, val);
    } else {
      this.inboxState.clearLocalTag(msg.id);
    }
    this.editingMsgId.set(null);
    this.editTagValue.set('');
  }

  /** Cancel edit without saving. */
  cancelEdit(): void {
    this.editingMsgId.set(null);
    this.editTagValue.set('');
  }

  // ─── Display helpers ───────────────────────────────────────────

  parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  enzoTagColor(tag: string): string {
    const colors: Record<string, string> = {
      'action-required': 'danger',
      'waiting':         'warning',
      'digest':          'tertiary',
      'newsletter':      'medium',
      'processed':       'success',
    };
    return colors[tag] ?? 'medium';
  }

  enzoTagLabel(tag: string): string {
    const labels: Record<string, string> = {
      'action-required': '⚡ Action',
      'waiting':         '⏳ Waiting',
      'digest':          '📋 Digest',
      'newsletter':      '📰 Newsletter',
      'processed':       '✓ Processed',
    };
    return labels[tag] ?? tag;
  }

  trackByMessage(_index: number, msg: EmailMessage): string {
    return msg.id;
  }
}
