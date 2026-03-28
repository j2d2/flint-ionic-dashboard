import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

const TOKEN_KEY         = 'dashboard_token';
const REFRESH_TOKEN_KEY = 'dashboard_refresh_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);

  // localStorage so auth survives browser restarts — login once, stay logged in for 30d
  readonly token           = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly isAuthenticated = computed(() => !!this.token());

  login(username: string, password: string) {
    return this.http
      .post<{ token: string; refreshToken: string }>('/api/auth/login', { username, password })
      .pipe(
        tap(({ token, refreshToken }) => this.storeTokens(token, refreshToken)),
      );
  }

  /** Exchange the stored refresh token for a new access+refresh pair. */
  refresh(): Observable<{ token: string; refreshToken: string }> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      this.clearTokens();
      return throwError(() => new Error('No refresh token'));
    }
    return this.http
      .post<{ token: string; refreshToken: string }>('/api/auth/refresh', { refreshToken })
      .pipe(
        tap(({ token, refreshToken: newRefresh }) => this.storeTokens(token, newRefresh)),
        catchError(err => {
          this.clearTokens();
          return throwError(() => err);
        }),
      );
  }

  logout(): void {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      // Fire-and-forget server-side revocation
      this.http.post('/api/auth/logout', { refreshToken }).subscribe({ error: () => {} });
    }
    this.clearTokens();
    this.router.navigate(['/login']);
  }

  private storeTokens(token: string, refreshToken: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    this.token.set(token);
  }

  private clearTokens(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.token.set(null);
  }
}
