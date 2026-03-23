import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';

const TOKEN_KEY = 'dashboard_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);

  readonly token          = signal<string | null>(sessionStorage.getItem(TOKEN_KEY));
  readonly isAuthenticated = computed(() => !!this.token());

  login(username: string, password: string) {
    return this.http
      .post<{ token: string }>('/api/auth/login', { username, password })
      .pipe(
        tap(({ token }) => {
          sessionStorage.setItem(TOKEN_KEY, token);
          this.token.set(token);
        }),
      );
  }

  logout(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    this.token.set(null);
    this.router.navigate(['/login']);
  }
}
