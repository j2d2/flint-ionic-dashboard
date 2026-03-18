import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  IonApp,
  IonSplitPane,
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonMenuToggle,
  IonItem,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonFooter,
  IonBadge,
} from '@ionic/angular/standalone';
import { environment } from '../environments/environment';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  addOutline,
  logoYoutube,
  banOutline,
  chatbubbleEllipsesOutline,
  chatbubbleOutline,
  checkmarkCircleOutline,
  chevronDownOutline,
  chevronForwardOutline,
  codeSlashOutline,
  eyeOutline,
  flashOutline,
  gitBranchOutline,
  gridOutline,
  hardwareChipOutline,
  heartCircleOutline,
  homeOutline,
  listOutline,
  mailOpenOutline,
  mailOutline,
  searchOutline,
  sendOutline,
  serverOutline,
  telescopeOutline,
  trophyOutline,
  warningOutline,
} from 'ionicons/icons';

import { AgentTask } from './models/agent-task.model';
import { Channel, DEFAULT_CHANNELS } from './models/channel.model';
import { ChannelService } from './services/channel.service';
import { EmailService } from './services/email.service';
import { InboxStateService } from './services/inbox-state.service';
import { SocketService } from './services/socket.service';
import { TaskService } from './services/task.service';
import { SystemStatsBarComponent } from './shared/system-stats-bar/system-stats-bar.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonMenuToggle,
    IonItem,
    IonIcon,
    IonLabel,
    IonRouterOutlet,
    IonFooter,
    IonBadge,
    SystemStatsBarComponent,
  ],
})
export class AppComponent implements OnInit {
  readonly appPages = [
    { title: 'Agent Tasks',   url: '/agent-tasks',    icon: 'flash-outline' },
    { title: 'Chat',          url: '/chat',            icon: 'chatbubble-outline' },
    { title: 'YouTube Agent', url: '/youtube-agent',   icon: 'logo-youtube' },
  ];

  readonly channels: Channel[] = DEFAULT_CHANNELS;
  channelsOpen = true;
  inboxOpen = true;
  readonly version = environment.version;
  readonly reviewTasks = signal<AgentTask[]>([]);
  readonly forReviewTasks = signal<AgentTask[]>([]);
  readonly blockedTasks = signal<AgentTask[]>([]);
  readonly inFlightTasks = signal<AgentTask[]>([]);
  readonly recentlyDoneTasks = signal<AgentTask[]>([]);
  readonly loadingAccounts = signal(false);

  // Accordion open state — all collapsed by default
  forReviewOpen = false;
  blockedOpen = false;
  inFlightOpen = false;
  recentlyDoneOpen = false;

  protected readonly inboxState = inject(InboxStateService);
  private readonly channelService = inject(ChannelService);
  private readonly emailService = inject(EmailService);
  private readonly taskService = inject(TaskService);
  private readonly socketService = inject(SocketService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      addOutline,
      addCircleOutline,
      banOutline,
      chatbubbleOutline,
      chatbubbleEllipsesOutline,
      checkmarkCircleOutline,
      chevronDownOutline,
      chevronForwardOutline,
      codeSlashOutline,
      eyeOutline,
      flashOutline,
      gitBranchOutline,
      gridOutline,
      hardwareChipOutline,
      heartCircleOutline,
      homeOutline,
      listOutline,
      mailOpenOutline,
      mailOutline,
      searchOutline,
      serverOutline,
      sendOutline,
      telescopeOutline,
      trophyOutline,
      warningOutline,
      logoYoutube,
    });
  }

  ngOnInit(): void {
    this.loadSidebarTasks();
    this.loadInboxAccounts();
    this.socketService.connect();
    // Keep all sidebar sections current without requiring a page reload.
    this.socketService.onTaskUpdate()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updated) => {
        // Remove from every list, then re-insert where applicable
        const allSigs = [this.reviewTasks, this.forReviewTasks, this.blockedTasks, this.inFlightTasks, this.recentlyDoneTasks];
        allSigs.forEach(sig => sig.update(list => list.filter(t => t.id !== updated.id)));

        if (updated.review_due === 1)
          this.reviewTasks.update(list => [updated, ...list]);
        if (updated.status === 'in_review')
          this.forReviewTasks.update(list => [updated, ...list]);
        if (updated.status === 'blocked' || updated.status === 'failed')
          this.blockedTasks.update(list => [updated, ...list]);
        if (updated.status === 'running')
          this.inFlightTasks.update(list => [updated, ...list]);
        if (updated.status === 'done')
          this.recentlyDoneTasks.update(list => [updated, ...list.slice(0, 14)]);
      });
  }

  loadSidebarTasks(): void {
    const recency = { order_by: 'updated_at' as const, order_dir: 'desc' as const };

    this.taskService.getTasks(0, 25, { review_due: 1, ...recency })
      .subscribe({ next: ({ tasks }) => this.reviewTasks.set(tasks) });

    this.taskService.getTasks(0, 50, { status: 'in_review', ...recency })
      .subscribe({ next: ({ tasks }) => this.forReviewTasks.set(tasks) });

    this.taskService.getTasks(0, 50, { status: 'blocked,failed', ...recency })
      .subscribe({ next: ({ tasks }) => this.blockedTasks.set(tasks) });

    this.taskService.getTasks(0, 50, { status: 'running', ...recency })
      .subscribe({ next: ({ tasks }) => this.inFlightTasks.set(tasks) });

    this.taskService.getTasks(0, 15, { status: 'done', ...recency })
      .subscribe({ next: ({ tasks }) => this.recentlyDoneTasks.set(tasks) });
  }

  toggleChannels(event?: Event): void {
    event?.stopPropagation();
    this.channelsOpen = !this.channelsOpen;
  }

  selectChannel(ch: Channel): void {
    this.channelService.select(ch);
  }

  loadInboxAccounts(): void {
    this.loadingAccounts.set(true);
    this.emailService.getSummary({ limit: 5 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.inboxState.setAccounts(result.accounts ?? []);
          this.loadingAccounts.set(false);
        },
        error: () => this.loadingAccounts.set(false),
      });
  }

  selectInboxAccount(email: string): void {
    this.inboxState.selectAccount(email);
    this.router.navigate(['/inbox']);
  }

  friendlyAccountLabel(account: string, source: string): string {
    return this.inboxState.accountDisplayName(account, source);
  }
}

