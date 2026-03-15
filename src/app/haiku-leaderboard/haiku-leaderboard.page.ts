import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonSegment,
  IonSegmentButton,
  IonRefresher,
  IonRefresherContent,
  IonNote,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonSpinner,
  IonText,
  IonMenuButton,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trophyOutline, ribbonOutline, timeOutline, flameOutline, documentTextOutline } from 'ionicons/icons';

import { HaikuEntry, HaikuListResponse, splitHaikuLines } from '../models/haiku.model';
import { HaikuService } from '../services/haiku.service';

@Component({
  selector: 'app-haiku-leaderboard',
  templateUrl: './haiku-leaderboard.page.html',
  styleUrls: ['./haiku-leaderboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonSegment,
    IonSegmentButton,
    IonRefresher,
    IonRefresherContent,
    IonNote,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonSpinner,
    IonText,
    IonMenuButton,
  ],
})
export class HaikuLeaderboardPage implements OnInit {
  private readonly haikuService = inject(HaikuService);

  readonly haikus = signal<HaikuEntry[]>([]);
  readonly total = signal(0);
  readonly isLoading = signal(false);
  readonly sortBy = signal<'votes' | 'newest'>('votes');

  /** Top 3 haikus for medal display */
  readonly topThree = computed(() => this.haikus().slice(0, 3));

  readonly splitLines = splitHaikuLines;

  readonly medalColors: Record<number, string | undefined> = {
    0: 'warning',   // gold
    1: 'medium',    // silver
    2: 'tertiary',  // bronze
  };

  readonly medalLabels: Record<number, string | undefined> = {
    0: '🥇',
    1: '🥈',
    2: '🥉',
  };

  constructor() {
    addIcons({ trophyOutline, ribbonOutline, timeOutline, flameOutline, documentTextOutline });
  }

  ngOnInit(): void {
    this.load();
  }

  load(event?: { target?: { complete?: () => void } }): void {
    this.isLoading.set(true);
    this.haikuService.getLeaderboard(this.sortBy(), 50, 0).subscribe({
      next: (res: HaikuListResponse) => {
        this.haikus.set(res.haikus);
        this.total.set(res.total);
        this.isLoading.set(false);
        event?.target?.complete?.();
      },
      error: () => {
        this.isLoading.set(false);
        event?.target?.complete?.();
      },
    });
  }

  onSortChange(event: CustomEvent): void {
    this.sortBy.set(event.detail.value as 'votes' | 'newest');
    this.load();
  }

  /** Unix seconds → local-formatted date */
  formatDate(created_at: number): string {
    return new Date(created_at * 1000).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  }

  /** Derive a display label from the source_doc path */
  sourceLabel(source_doc?: string): string {
    if (!source_doc) return '';
    const name = source_doc.split('/').pop() ?? source_doc;
    return name.replace(/\.md$/, '').replace(/-/g, ' ');
  }

  /** Open source_doc in Obsidian via URI scheme */
  openInVault(source_doc?: string): void {
    if (!source_doc) return;
    // Remove .md extension — Obsidian URI doesn't need it
    const file = source_doc.replace(/\.md$/, '');
    const uri = `obsidian://open?vault=obsidian-vault&file=${encodeURIComponent(file)}`;
    window.open(uri, '_blank');
  }
}
