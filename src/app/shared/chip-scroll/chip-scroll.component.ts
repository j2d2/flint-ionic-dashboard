/**
 * ChipScrollComponent — full-width single-row horizontally scrollable chip strip.
 *
 * Usage:
 *   <app-chip-scroll
 *     [tags]="allTags()"
 *     [activeTag]="activeTagFilter()"
 *     (tagClick)="toggleTagFilter($event)">
 *   </app-chip-scroll>
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { IonChip } from '@ionic/angular/standalone';

@Component({
  selector: 'app-chip-scroll',
  templateUrl: './chip-scroll.component.html',
  styleUrls: ['./chip-scroll.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IonChip],
})
export class ChipScrollComponent {
  @Input() tags: string[] = [];
  @Input() activeTag: string | null = null;
  @Output() tagClick = new EventEmitter<string>();
}
