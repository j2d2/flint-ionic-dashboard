import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addCircleOutline } from 'ionicons/icons';

import { AgentTask, QueueStats, statusColor } from '../models/agent-task.model';
import { Channel, DEFAULT_CHANNELS } from '../models/channel.model';
import { NewThreadModalComponent } from '../new-thread/new-thread-modal.component';
import { ChannelService } from '../services/channel.service';
import { TaskService } from '../services/task.service';

@Component({
  selector: 'app-dashboard-page',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, IonicModule],
})
export class DashboardPage implements OnInit {
  readonly channels: Channel[] = DEFAULT_CHANNELS;
  readonly view = signal<'kanban' | 'list'>('kanban');
  readonly stats = signal<QueueStats | null>(null);
  readonly tasksByChannel = signal<Record<string, AgentTask[] | undefined>>({});
  readonly statusColor = statusColor;

  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private readonly modalController = inject(ModalController);
  private readonly channelService = inject(ChannelService);

  readonly activeChannelId = computed(() => this.channelService.activeChannel()?.id ?? null);

  constructor() {
    addIcons({ addCircleOutline });
    effect(() => {
      const id = this.activeChannelId();
      if (id) {
        this.scrollToChannel(id);
      }
    });
  }

  ngOnInit(): void {
    this.loadStats();
    this.loadChannelTasks();
  }

  loadStats(event?: CustomEvent): void {
    this.taskService.getStats().subscribe({
      next: (s) => this.stats.set(s),
      complete: () => (event as any)?.detail?.complete(),
    });
  }

  loadChannelTasks(): void {
    this.taskService.getTasks(0, 200).subscribe({
      next: (r) => {
        const grouped: Record<string, AgentTask[]> = {};
        for (const ch of this.channels) grouped[ch.id] = [];
        for (const t of r.tasks ?? []) {
          const chTag = (t.tags ?? '').split(',').map((s: string) => s.trim())
            .find((s: string) => s.startsWith('channel:'));
          const chId = chTag ? chTag.split(':')[1] : 'inbox';
          if (!grouped[chId]) grouped[chId] = [];
          grouped[chId].push(t);
        }
        this.tasksByChannel.set(grouped);
      },
    });
  }

  toggleView(): void {
    this.view.update((v) => (v === 'kanban' ? 'list' : 'kanban'));
  }

  openTask(id: string): void {
    void this.router.navigate(['/task', id]);
  }

  goToAgentTasks(): void {
    void this.router.navigate(['/agent-tasks']);
  }

  goToChat(): void {
    void this.router.navigate(['/chat']);
  }

  async newThread(channelId?: string): Promise<void> {
    const modal = await this.modalController.create({
      component: NewThreadModalComponent,
      componentProps: { mode: 'thread', channelId },
      breakpoints: [0, 0.7, 1],
      initialBreakpoint: 0.7,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data?.task) {
      this.loadChannelTasks();
    }
  }

  private scrollToChannel(channelId: string): void {
    setTimeout(() => {
      const el = document.getElementById(`col-${channelId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }, 150);
  }
}

