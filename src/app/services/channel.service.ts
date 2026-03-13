import { Injectable, signal } from '@angular/core';
import { Channel } from '../models/channel.model';

@Injectable({ providedIn: 'root' })
export class ChannelService {
  readonly activeChannel = signal<Channel | null>(null);

  select(channel: Channel): void {
    this.activeChannel.set(channel);
  }

  clear(): void {
    this.activeChannel.set(null);
  }
}
