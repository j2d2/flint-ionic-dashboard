import { Component } from '@angular/core';
import { addIcons } from 'ionicons';
import { addCircleOutline, listOutline } from 'ionicons/icons';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  readonly appPages = [
    { title: 'Dashboard', url: '/dashboard', icon: 'list-outline' },
    { title: 'New Thread', url: '/new-thread', icon: 'add-circle-outline' },
  ];

  constructor() {
    addIcons({ addCircleOutline, listOutline });
  }
}
