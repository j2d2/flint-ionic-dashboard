import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';

import { ChatResponse, ChatService } from '../services/chat.service';

interface Message {
  role: 'user' | 'flint';
  text: string;
  model?: string;
}

const MODEL_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'qwen3:8b', label: 'Qwen3 8B' },
  { value: 'gemma3:4b', label: 'Gemma3 4B' },
  { value: 'qwen2.5-coder:14b', label: 'Coder 14B' },
  { value: 'claude-sonnet-4-6', label: 'Claude' },
];

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
  readonly selectedModel = signal('auto');
  readonly modelOptions = MODEL_OPTIONS;

  private readonly chatService = inject(ChatService);

  send(): void {
    const prompt = this.input().trim();
    if (!prompt || this.isSending()) return;

    this.messages.update((msgs) => [...msgs, { role: 'user', text: prompt }]);
    this.input.set('');
    this.isSending.set(true);

    const model = this.selectedModel();
    this.chatService.chat(prompt, model === 'auto' ? undefined : model).subscribe({
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
