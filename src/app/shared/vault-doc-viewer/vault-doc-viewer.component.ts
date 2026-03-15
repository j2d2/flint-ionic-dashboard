/**
 * VaultDocViewerComponent — reusable modal for rendering any vault markdown doc.
 *
 * Usage (open from any page):
 *   const modal = await this.modalController.create({
 *     component: VaultDocViewerComponent,
 *     componentProps: { vaultNotePath: task.vault_note },
 *   });
 *   await modal.present();
 */
import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonSpinner, IonText, IonTitle, IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';

import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-vault-doc-viewer',
  templateUrl: './vault-doc-viewer.component.html',
  styleUrls: ['./vault-doc-viewer.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    IonButton, IonButtons, IonContent, IonHeader, IonSpinner, IonText, IonTitle, IonToolbar,
    MarkdownPipe,
  ],
})
export class VaultDocViewerComponent implements OnInit {
  readonly vaultNotePath = input('');

  readonly markdown = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private readonly http = inject(HttpClient);
  private readonly modalController = inject(ModalController);

  ngOnInit(): void {
    if (!this.vaultNotePath()) {
      this.error.set('No vault path provided');
      this.loading.set(false);
      return;
    }
    const params = new HttpParams().set('path', this.vaultNotePath());
    this.http.get<{ path: string; markdown: string }>('/api/vault/doc', { params }).subscribe({
      next: (r) => {
        this.markdown.set(r.markdown);
        this.loading.set(false);
      },
      error: (e: { error?: { error?: string }; message?: string }) => {
        this.error.set(e.error?.error ?? e.message ?? 'Failed to load vault doc');
        this.loading.set(false);
      },
    });
  }

  async close(): Promise<void> {
    await this.modalController.dismiss();
  }
}
