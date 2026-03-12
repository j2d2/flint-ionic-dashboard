import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';

import { ThreadService } from '../services/thread.service';

@Component({
  selector: 'app-new-thread-modal',
  templateUrl: './new-thread-modal.component.html',
  styleUrls: ['./new-thread-modal.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class NewThreadModalComponent {
  @Input() taskId = 'ad-hoc';
  @Output() threadStarted = new EventEmitter<string>();

  readonly isSubmitting = signal(false);
  prompt = '';
  agentType = 'standard';

  readonly agentTypes = [
    { value: 'standard', label: 'Standard Agent' },
    { value: 'code', label: 'Code Agent' },
    { value: 'research', label: 'Research Agent' },
  ];

  private readonly modalController = inject(ModalController);
  private readonly threadService = inject(ThreadService);
  private readonly router = inject(Router);

  async dismiss(data?: unknown): Promise<void> {
    const wasModalDismissed = await this.modalController.dismiss(data);
    if (!wasModalDismissed) {
      void this.router.navigate(['/dashboard']);
    }
  }

  submit(): void {
    const cleanPrompt = this.prompt.trim();
    if (!cleanPrompt || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.threadService.startThread(this.taskId, cleanPrompt, this.agentType).subscribe({
      next: (result) => {
        this.threadStarted.emit(result.threadId);
        void this.dismiss({ threadId: result.threadId });
      },
      error: () => this.isSubmitting.set(false),
      complete: () => this.isSubmitting.set(false),
    });
  }
}
