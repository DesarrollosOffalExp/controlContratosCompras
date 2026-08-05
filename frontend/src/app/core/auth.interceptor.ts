import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Con Easy Auth en modo "Allow unauthenticated", la plataforma autentica pero
 * NO fuerza el login: la autorización la hace la app contra el padrón `acceso`.
 *
 * Si la API responde 401 (no llega identidad = no hay sesión), mandamos al
 * usuario al login de Entra y lo devolvemos a la misma página. Un 403 (hay
 * identidad pero el rol no alcanza) NO redirige: se muestra el error.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err) => {
      if (err.status === 401) {
        const destino = window.location.pathname + window.location.search;
        window.location.href =
          `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(destino)}`;
      }
      return throwError(() => err);
    })
  );
