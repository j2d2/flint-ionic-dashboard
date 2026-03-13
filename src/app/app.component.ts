import { Component } from '@angular/core';
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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  chatbubbleOutline,
  flashOutline,
  gridOutline,
  hardwareChipOutline,
  listOutline,
  telescopeOutline,
} from 'ionicons/icons';

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
  ],
})
export class AppComponent {
  readonly appPages = [
    { title: 'Device Info',      url: '/home',        icon: 'hardware-chip-outline' },
    { title: 'Mission Control',  url: '/dashboard',   icon: 'grid-outline'          },
    { title: 'Agent Tasks',      url: '/agent-tasks', icon: 'flash-outline'         },
    { title: 'Chat',             url: '/chat',        icon: 'chatbubble-outline'    },
  ];

  constructor() {
    addIcons({
      addCircleOutline,
      chatbubbleOutline,
      flashOutline,
      gridOutline,
      hardwareChipOutline,
      listOutline,
      telescopeOutline,
    });
  }
}

