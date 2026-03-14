import { Component, OnInit, inject, signal } from '@angular/core';
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
  chatbubbleEllipsesOutline,
  chatbubbleOutline,
  chevronDownOutline,
  chevronForwardOutline,
  codeSlashOutline,
  flashOutline,
  gitBranchOutline,
  gridOutline,
  hardwareChipOutline,
  heartCircleOutline,
  homeOutline,
  listOutline,
  mailOutline,
  searchOutline,
  sendOutline,
  serverOutline,
  telescopeOutline,
  trophyOutline,
} from 'ionicons/icons';

import { AgentTask } from './models/agent-task.model';
import { Channel, DEFAULT_CHANNELS } from './models/channel.model';
import { ChannelService } from './services/channel.service';
import { TaskService } from './services/task.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: true,
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
  ],
})
export class AppComponent implements OnInit {
  readonly appPages = [
    { title: 'Agent Tasks', url: '/agent-tasks', icon: 'flash-outline' },
    { title: 'Chat',        url: '/chat',        icon: 'chatbubble-outline' },
  ];

  readonly channels: Channel[] = DEFAULT_CHANNELS;
  channelsOpen = true;
  readonly version = environment.version;
  readonly reviewTasks = signal<AgentTask[]>([]);

  private readonly channelService = inject(ChannelService);
  private readonly taskService = inject(TaskService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({
      addOutline,
      addCircleOutline,
      chatbubbleOutline,
      chatbubbleEllipsesOutline,
      chevronDownOutline,
      chevronForwardOutline,
      codeSlashOutline,
      flashOutline,
      gitBranchOutline,
      gridOutline,
      hardwareChipOutline,
      heartCircleOutline,
      homeOutline,
      listOutline,
      mailOutline,
      searchOutline,
      serverOutline,
      sendOutline,
      telescopeOutline,
      trophyOutline,
    });
  }

  ngOnInit(): void {
    this.loadReviewTasks();
  }

  loadReviewTasks(): void {
    this.taskService.getTasks(0, 100).subscribe({
      next: ({ tasks }) => this.reviewTasks.set(tasks.filter((t) => t.review_due === 1)),
    });
  }

  toggleChannels(event?: Event): void {
    event?.stopPropagation();
    this.channelsOpen = !this.channelsOpen;
  }

  selectChannel(ch: Channel): void {
    this.channelService.select(ch);
  }
}

