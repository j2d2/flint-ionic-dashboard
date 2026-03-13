import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import { ChatResponse, ChatService } from '../services/chat.service';

interface Message {
  role: 'user' | 'flint';
  text: string;
  model?: string;
}

@Component({
  selector: 'app-chat-page',
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class ChatPage {
  @ViewChild('msgList') private msgList!: ElementRef<HTMLIonContentElement>;

  readonly messages = signal<Message[]>([]);
  readonly input = signal('');
  readonly isSending = signal(false);

  private readonly chatService = inject(ChatService);

  send(): void {
    const prompt = this.input().trim();
    if (!prompt || this.isSending()) return;

    this.messages.update((msgs) => [...msgs, { role: 'user', text: prompt }]);
    this.input.set('');
    this.isSending.set(true);

    this.chatService.chat(prompt).subscribe({
      next: (res: ChatResponse) => {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'flint', text: res.response, model: res.model },
        ]);
        this.isSending.set(false);
        setTimeout(() => this.msgList?.nativeElement?.scrollToBottom(200), 50);
      },
      error: (err: Error) => {
        this.messages.update((msgs) => [
          ...msgs,
          { role: 'flint', text: `Error: ${err.message}` },
        ]);
        this.isSending.set(false);
      },
    });

    setTimeout(() => this.msgList?.nativeElement?.scrollToBottom(200), 50);
  }

  onEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }
}
