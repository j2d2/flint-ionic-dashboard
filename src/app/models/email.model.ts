export type EnzoTag =
  | 'action-required'
  | 'waiting'
  | 'digest'
  | 'newsletter'
  | 'processed';

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  is_unread: boolean;
  is_starred: boolean;
  labels: string[];
  enzo_tag?: EnzoTag | null;
}

export interface EmailAccount {
  source: 'gmail' | 'outlook';
  account: string;
  messages: EmailMessage[];
  unread_count: number;
  total_fetched: number;
}

export interface InboxSummaryResponse {
  fetched_at: string;
  accounts: EmailAccount[];
  errors: string[];
  _cached?: boolean;
  _cache_age_s?: number;
}
