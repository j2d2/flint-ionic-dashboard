import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';

interface SystemInfo {
  tier: string;
  tier_label: string;
  hostname: string;
  platform: string;
  arch: string;
  cpu_cores: number;
  cpu_model: string;
  total_mem_gb: number;
  free_mem_gb: number;
  uptime_h: number;
  node_version: string;
  flint_url: string;
  vault_path: string;
}

@Component({
  selector: 'app-home-page',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class HomePage implements OnInit {
  readonly info = signal<SystemInfo | null>(null);
  readonly error = signal<string | null>(null);

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  ngOnInit(): void {
    this.http.get<SystemInfo>('/api/system').subscribe({
      next: (data) => this.info.set(data),
      error: () => this.error.set('Could not load system info'),
    });
  }

  goTo(path: string): void {
    void this.router.navigate([path]);
  }
}
