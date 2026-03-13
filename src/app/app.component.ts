import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
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
} from 'ionicons/icons';

import { Channel, DEFAULT_CHANNELS } from './models/channel.model';
import { ChannelService } from './services/channel.service';

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
  ],
})
export class AppComponent {
  readonly appPages = [
    { title: 'Mission Control',  url: '/dashboard',   icon: 'grid-outline'          },
    { title: 'Agent Tasks',      url: '/agent-tasks', icon: 'flash-outline'         },
    { title: 'Chat',             url: '/chat',        icon: 'chatbubble-outline'    },
  ];

  readonly channels: Channel[] = DEFAULT_CHANNELS;
  channelsOpen = false;
  readonly version = environment.version;

  private readonly channelService = inject(ChannelService);

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
    });
  }

  toggleChannels(): void {
    this.channelsOpen = !this.channelsOpen;
  }

  selectChannel(ch: Channel): void {
    this.channelService.select(ch);
  }
}

