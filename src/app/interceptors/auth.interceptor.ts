import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth  = inject(AuthService);
  const token = auth.token();

  const reqWithToken = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(reqWithToken).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only auto-refresh on 401s for non-auth endpoints (avoids refresh loops)
      if (error.status !== 401 || req.url.includes('/api/auth/')) {
        return throwError(() => error);
      }

      // Exchange refresh token → new access token → retry original request
      return auth.refresh().pipe(
        switchMap(({ token: newToken }) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }))
        ),
        catchError(refreshError => {
          // Refresh failed (expired or revoked) — bounce to login
          auth.logout();
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
