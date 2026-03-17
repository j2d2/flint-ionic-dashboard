import { Injectable, computed, signal } from '@angular/core';
import { EmailAccount } from '../models/email.model';

/**
 * Shared state for the inbox.
 * - `accounts` — populated by InboxPage or AppComponent on load
 * - `selectedAccount` — email address of the currently viewed account
 * - `localTags` — pending tag applies queued client-side (Option A)
 */
@Injectable({ providedIn: 'root' })
export class InboxStateService {
  readonly accounts = signal<EmailAccount[]>([]);
  readonly selectedAccount = signal<string>('');

  private readonly _localTags = signal<Record<string, string>>({});
  readonly localTags = this._localTags.asReadonly();

  readonly pendingCount = computed(() => Object.keys(this._localTags()).length);

  setAccounts(accounts: EmailAccount[]): void {
    this.accounts.set(accounts);
    // Auto-select first account if nothing selected yet
    if (!this.selectedAccount() && accounts.length > 0) {
      this.selectedAccount.set(accounts[0].account);
    }
  }

  selectAccount(email: string): void {
    this.selectedAccount.set(email);
  }

  setLocalTag(msgId: string, tag: string): void {
    this._localTags.update(q => ({ ...q, [msgId]: tag }));
  }

  clearLocalTag(msgId: string): void {
    this._localTags.update(q => {
      const next = { ...q };
      delete next[msgId];
      return next;
    });
  }

  getLocalTag(msgId: string): string | undefined {
    return this._localTags()[msgId];
  }

  /** Human-friendly display name for an account. */
  accountDisplayName(account: string, source: string): string {
    if (source === 'gmail') return 'Personal';
    const a = account.toLowerCase();
    if (a.includes('hotmail') || a.includes('gibbs')) return "Hotmail";
    if (a.includes('filmstacker')) return 'Filmstacker';
    return account;
  }
}
