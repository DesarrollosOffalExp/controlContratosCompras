import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Usuario } from './models';

// Forma en que el backend (padrón `acceso`) devuelve la identidad en /api/me.
interface MeResponse {
  user: { UsuarioId: number; Nombre: string; Email: string; Rol: string };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly usuario = signal<Usuario | null>(null);
  readonly isLoggedIn = computed(() => this.usuario() !== null);

  constructor(private http: HttpClient) {}

  /**
   * Carga la identidad del usuario ya autenticado por Azure Easy Auth.
   * Se llama una vez al arrancar la app (ver app.config.ts). El login en sí
   * lo resuelve la plataforma; acá solo traemos nombre y rol para la barra.
   */
  async cargar(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<MeResponse>(`${environment.apiUrl}/me`));
      const u = res.user;
      this.usuario.set({
        id: u.UsuarioId,
        nombre: u.Nombre || u.Email,
        email: u.Email,
        rol: (u.Rol || '').toLowerCase() as Usuario['rol'],
      });
    } catch {
      // 401/403: sin identidad válida. La app queda sin usuario; en Azure esto
      // no debería pasar porque Easy Auth exige login antes de servir la página.
      this.usuario.set(null);
    }
  }

  /** Cierra la sesión de Easy Auth (redirige al logout de la plataforma). */
  logout(): void {
    const portal = 'https://offal-hsb3c0gebjgbfmae.eastus-01.azurewebsites.net';
    window.location.href = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(portal)}`;
  }
}
