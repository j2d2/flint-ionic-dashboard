/**
 * SystemStatsBarComponent — persistent footer bar visible on all routes.
 * Displays live RAM usage, session network delta, uptime, and 5-snapshot history.
 * Thin (≤40px), non-scrolling, outside ion-split-pane so it's truly global.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';

import { SystemStatsService } from '../../services/system-stats.service';

@Component({
  selector: 'app-system-stats-bar',
  templateUrl: './system-stats-bar.component.html',
  styleUrls: ['./system-stats-bar.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, DatePipe],
})
export class SystemStatsBarComponent {
  protected readonly stats = inject(SystemStatsService);

  /** HH:MM:SS string from uptime_sec signal. */
  protected readonly uptime = computed(() => {
    const s = this.stats.uptime_sec();
    const h = Math.floor(s / 3600).toString().padStart(2, '0');
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${h}:${m}:${sec}`;
  });

  /** 0–1 fill ratio for the RAM progress bar. */
  protected readonly ramPct = computed(() => {
    const snap = this.stats.latest();
    if (!snap || snap.ram_total_gb === 0) return 0;
    return snap.ram_used_gb / snap.ram_total_gb;
  });

  /** Last 5 snapshots for the inline history strip. */
  protected readonly lastFive = computed(() => this.stats.snapshots().slice(0, 5));
}
