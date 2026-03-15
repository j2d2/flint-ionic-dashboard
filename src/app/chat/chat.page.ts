import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonMenuButton,
  IonSelect, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, flashOutline } from 'ionicons/icons';

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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, RouterModule,
    IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonMenuButton,
    IonSelect, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar,
  ],
})
export class ChatPage implements OnInit {
  @ViewChild('msgList') private msgList!: ElementRef<HTMLIonContentElement>;

  readonly messages = signal<Message[]>([]);
  readonly input = signal('');
  readonly isSending = signal(false);
  readonly selectedModel = signal('auto');
  readonly modelOptions = MODEL_OPTIONS;
  readonly taskContext = signal<{ taskId?: string; taskTitle?: string; vaultMarkdown?: string; sessionTaskId?: string; sessionTaskTitle?: string } | null>(null);
  readonly isThread = signal(false);
  private vaultContextText = '';

  private readonly chatService = inject(ChatService);

  constructor() {
    addIcons({ flashOutline, arrowBackOutline });
  }

  ngOnInit(): void {
    const state = (window.history.state ?? {}) as { taskId?: string; taskTitle?: string; vaultMarkdown?: string; sessionTaskId?: string; sessionTaskTitle?: string };
    if (state?.taskId) {
      this.taskContext.set(state);
      this.isThread.set(!!state.sessionTaskId);
      this.vaultContextText = state.vaultMarkdown ?? '';
      const greeting = state.sessionTaskId
        ? `Thread started: "${state.sessionTaskTitle ?? state.taskTitle}". This session is saved under the task.`
        : `Chat context: "${state.taskTitle}". This session is ephemeral — not saved to the task.`;
      this.messages.set([{ role: 'flint', text: greeting }]);
    }
  }

  send(): void {
    const prompt = this.input().trim();
    if (!prompt || this.isSending()) return;

    this.messages.update((msgs) => [...msgs, { role: 'user', text: prompt }]);
    this.input.set('');
    this.isSending.set(true);

    // Inject vault doc context once on first message from a task thread
    let contextualPrompt = prompt;
    if (this.vaultContextText) {
      contextualPrompt = `[Task vault context]\n${this.vaultContextText.slice(0, 3000)}\n\n---\n${prompt}`;
      this.vaultContextText = '';
    }
    const model = this.selectedModel();
    this.chatService.chat(contextualPrompt, model === 'auto' ? undefined : model).subscribe({
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
