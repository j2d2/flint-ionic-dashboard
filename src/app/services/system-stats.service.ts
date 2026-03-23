/**
 * SystemStatsService — polls /api/system/stats every 5 minutes, keeps
 * session-scoped RAM peak and cumulative network delta, and ticks an
 * uptime counter every second. Exposes Angular Signals for OnPush compat.
 */
import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Subscription, interval } from 'rxjs';

export interface SystemSnapshot {
  ram_used_gb: number;
  ram_total_gb: number;
  rx_bytes: number;
  tx_bytes: number;
  api_request_count: number;
  api_input_tokens: number;
  api_output_tokens: number;
  api_cost_usd: number;
  timestamp_ms: number;
}

@Injectable({ providedIn: 'root' })
export class SystemStatsService implements OnDestroy {
  private readonly http = inject(HttpClient);

  /** ISO timestamp of when this browser session started. */
  readonly session_start = Date.now();

  /** Up to 10 snapshots, newest first. */
  readonly snapshots = signal<SystemSnapshot[]>([]);

  /** Seconds elapsed since service construction (ticks every 1 s). */
  readonly uptime_sec = signal(0);

  /** Latest snapshot, or null before first poll. */
  readonly latest = computed(() => this.snapshots()[0] ?? null);

  /** Session-peak RAM used (GB). */
  readonly peak_ram_gb = computed(() =>
    this.snapshots().reduce((max, s) => Math.max(max, s.ram_used_gb), 0)
  );

  /** Cumulative session RX since first reading (MB). */
  readonly session_rx_mb = computed(() => {
    const snaps = this.snapshots();
    if (!snaps.length || !this._baselineSet) return 0;
    return Math.max(0, (snaps[0].rx_bytes - this._baseline_rx) / 1024 ** 2);
  });

  /** Cumulative session TX since first reading (MB). */
  readonly session_tx_mb = computed(() => {
    const snaps = this.snapshots();
    if (!snaps.length || !this._baselineSet) return 0;
    return Math.max(0, (snaps[0].tx_bytes - this._baseline_tx) / 1024 ** 2);
  });

  /** Latest Claude API usage from the Flint sidecar (cumulative since server restart). */
  readonly api_request_count = computed(() => this.latest()?.api_request_count ?? 0);
  readonly api_input_tokens  = computed(() => this.latest()?.api_input_tokens ?? 0);
  readonly api_output_tokens = computed(() => this.latest()?.api_output_tokens ?? 0);
  readonly api_cost_usd      = computed(() => this.latest()?.api_cost_usd ?? 0);

  private _baseline_rx = 0;
  private _baseline_tx = 0;
  private _baselineSet = false;
  private readonly _subs: Subscription[] = [];

  constructor() {
    // Immediate first poll to populate baseline
    this._poll();
    // Poll every 60 s — fast enough to show net delta within a minute
    this._subs.push(interval(60 * 1000).subscribe(() => this._poll()));
    // Uptime tick every second
    this._subs.push(interval(1000).subscribe(() => this.uptime_sec.update(s => s + 1)));
  }

  private _poll(): void {
    this.http.get<SystemSnapshot>('/api/system/stats').subscribe({
      next: (snap) => {
        if (!this._baselineSet) {
          this._baseline_rx = snap.rx_bytes;
          this._baseline_tx = snap.tx_bytes;
          this._baselineSet = true;
        }
        this.snapshots.update(prev => [snap, ...prev].slice(0, 10));
      },
      error: (err) => console.warn('[SystemStatsService] poll failed:', (err as Error).message),
    });
  }

  ngOnDestroy(): void {
    this._subs.forEach(s => s.unsubscribe());
  }
}
