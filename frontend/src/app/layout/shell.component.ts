import { Component, signal, HostListener, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../core/auth.service';

// Portal / índice general de Offal (el logo y el botón Inicio llevan ahí).
// Cambiar si el portal muda de dominio propio.
const PORTAL_URL = 'https://offal-hsb3c0gebjgbfmae.eastus-01.azurewebsites.net';

// Secciones del sistema (menú en línea; en mobile colapsan al hamburguesa).
const SECCIONES = [
  { label: 'Panel', path: '/dashboard', icon: 'bi-speedometer2' },
  { label: 'Contratos', path: '/contratos', icon: 'bi-journal-text' },
  { label: 'Proveedores', path: '/proveedores', icon: 'bi-people' },
  { label: 'Sectores', path: '/sectores', icon: 'bi-diagram-3' },
];

/**
 * Barra de navegación unificada Offal (misma convención que proveedores,
 * etiquetas y lavados): fondo --panel con borde inferior rojo de 2px, logo en
 * círculo blanco clickeable al portal, menús en línea (hamburguesa solo en
 * mobile), botón Inicio, chip de usuario clickeable (avatar + nombre + rol) y
 * "Cerrar sesión" con ícono.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="offal-nav">
      <div class="nav-inner">
        <!-- Hamburguesa: solo mobile -->
        <button class="hamb" type="button" aria-label="Menú" (click)="toggleMenu($event)">
          <i class="bi bi-list"></i>
        </button>

        <!-- Logo en círculo blanco: link al índice general de Offal -->
        <a class="brand-logo" [href]="portalUrl" title="Ir al inicio de Offal">
          <img src="logo.png" alt="Offal">
        </a>
        <span class="brand-title">Compras · Contratos</span>

        <!-- Menús en línea: solo desktop -->
        <ul class="nav-links">
          @for (s of secciones; track s.path) {
            <li>
              <a [routerLink]="s.path" routerLinkActive="active">
                <i class="bi" [class]="s.icon"></i><span>{{ s.label }}</span>
              </a>
            </li>
          }
        </ul>

        <span class="spacer"></span>

        <!-- Botón Inicio: vuelve al portal general de Offal -->
        <a class="btn-inicio" [href]="portalUrl">
          <i class="bi bi-house-door"></i><span>Inicio</span>
        </a>

        <!-- Chip de usuario clickeable -->
        <div class="user-wrap">
          <button class="user-chip" (click)="toggleUser($event)">
            <span class="avatar">{{ iniciales() }}</span>
            <span class="user-meta">
              <span class="user-name">{{ nombre() }}</span>
              @if (auth.usuario()?.rol) { <span class="user-rol">{{ auth.usuario()?.rol }}</span> }
            </span>
            <i class="bi bi-chevron-down caret"></i>
          </button>

          @if (userOpen()) {
            <div class="menu-backdrop" (click)="cerrarMenus()"></div>
            <div class="user-menu">
              <div class="user-menu-head">
                <span class="user-menu-name">{{ nombre() }}</span>
                <span class="user-menu-mail">{{ auth.usuario()?.email }}</span>
              </div>
              <a class="user-menu-item neutro" [href]="portalUrl">
                <i class="bi bi-house-door"></i>Ir al inicio
              </a>
              <button class="user-menu-item" (click)="logout()">
                <i class="bi bi-box-arrow-right"></i>Cerrar sesión
              </button>
            </div>
          }
        </div>

        <button class="btn-logout" (click)="logout()">
          <i class="bi bi-box-arrow-right"></i><span>Cerrar sesión</span>
        </button>
      </div>

      <!-- Menú desplegable en mobile -->
      @if (mobileOpen()) {
        <div class="menu-backdrop" (click)="cerrarMenus()"></div>
        <ul class="nav-links-mobile">
          @for (s of secciones; track s.path) {
            <li>
              <a [routerLink]="s.path" routerLinkActive="active" (click)="cerrarMenus()">
                <i class="bi" [class]="s.icon"></i>{{ s.label }}
              </a>
            </li>
          }
        </ul>
      }
    </nav>

    <main class="container-fluid py-4 px-4">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    .offal-nav {
      position: sticky; top: 0; z-index: 30;
      background: var(--panel);
      border-bottom: 2px solid var(--red);
      box-shadow: 0 6px 20px rgba(0,0,0,.28);
    }
    .nav-inner {
      display: flex; align-items: center; gap: 14px;
      height: 64px; padding: 0 20px; max-width: 1400px; margin: 0 auto;
    }

    .hamb {
      display: none; background: transparent; border: 0; color: var(--text);
      font-size: 22px; cursor: pointer; padding: 4px 6px;
    }

    .brand-logo {
      width: 40px; height: 40px; border-radius: 50%; background: #fff;
      display: grid; place-items: center; flex-shrink: 0; text-decoration: none;
    }
    .brand-logo img { width: 26px; height: 26px; object-fit: contain; display: block; }
    .brand-title {
      font-weight: 700; font-size: 16px; color: var(--text); white-space: nowrap;
      letter-spacing: -.01em;
    }

    .nav-links { display: flex; align-items: center; gap: 4px; list-style: none; margin: 0 0 0 12px; padding: 0; }
    .nav-links a {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 12px; border-radius: 9px; text-decoration: none;
      color: var(--muted); font-size: 14px; font-weight: 600; white-space: nowrap;
      transition: background .15s, color .15s;
    }
    .nav-links a:hover { color: var(--text); background: rgba(255,255,255,.06); }
    .nav-links a.active { color: #fff; background: var(--red); }

    .spacer { flex: 1 1 auto; }

    .btn-inicio, .btn-logout {
      display: inline-flex; align-items: center; gap: 7px;
      background: transparent; border: 0; cursor: pointer;
      color: var(--muted); font-size: 14px; font-weight: 600; white-space: nowrap;
      padding: 8px 12px; border-radius: 9px; text-decoration: none;
      transition: background .15s, color .15s;
    }
    .btn-inicio:hover, .btn-logout:hover { color: var(--text); background: rgba(255,255,255,.06); }
    .btn-logout { border: 1px solid var(--line); }
    .btn-logout:hover { border-color: var(--red); color: #fff; background: rgba(199,22,58,.12); }

    /* ---- Chip de usuario ---- */
    .user-wrap { position: relative; }
    .user-chip {
      display: flex; align-items: center; gap: 9px;
      background: transparent; border: 1px solid var(--line); border-radius: 999px;
      padding: 5px 10px 5px 5px; cursor: pointer; color: var(--text);
      transition: border-color .15s, background .15s;
    }
    .user-chip:hover { border-color: var(--red); background: rgba(199,22,58,.10); }
    .avatar {
      width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center;
      font-size: 13px; font-weight: 700; color: #fff;
      background: linear-gradient(135deg, var(--red), var(--red-deep));
    }
    .user-meta { display: flex; flex-direction: column; line-height: 1.15; text-align: left; }
    .user-name { font-size: 13px; font-weight: 600; color: var(--text); }
    .user-rol { font-size: 10px; color: var(--muted); text-transform: capitalize; }
    .caret { font-size: 12px; color: var(--muted); }

    .menu-backdrop { position: fixed; inset: 0; z-index: 40; }
    .user-menu {
      position: absolute; top: calc(100% + 8px); right: 0; z-index: 50; min-width: 220px;
      background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
      padding: 6px; box-shadow: 0 16px 40px rgba(0,0,0,.5);
    }
    .user-menu-head { padding: 8px 10px 10px; border-bottom: 1px solid var(--line); margin-bottom: 6px; display: flex; flex-direction: column; gap: 2px; }
    .user-menu-name { font-size: 13px; font-weight: 600; color: var(--text); }
    .user-menu-mail { font-size: 12px; color: var(--muted); word-break: break-all; }
    .user-menu-item {
      display: flex; align-items: center; gap: 9px; width: 100%;
      padding: 9px 10px; border: 0; border-radius: 8px; background: transparent;
      text-align: left; text-decoration: none; cursor: pointer;
      color: var(--red-bright); font-size: 13px; font-weight: 600; font-family: inherit;
    }
    .user-menu-item.neutro { color: var(--text); }
    .user-menu-item:hover { background: rgba(199,22,58,.12); }
    .user-menu-item.neutro:hover { background: rgba(255,255,255,.06); }

    /* ---- Mobile ---- */
    .nav-links-mobile { list-style: none; margin: 0; padding: 6px; background: var(--panel); border-top: 1px solid var(--line); position: relative; z-index: 50; }
    .nav-links-mobile a {
      display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 9px;
      text-decoration: none; color: var(--muted); font-weight: 600; font-size: 15px;
    }
    .nav-links-mobile a.active { color: #fff; background: var(--red); }

    @media (max-width: 860px) {
      .hamb { display: inline-flex; }
      .nav-links, .btn-inicio span, .btn-logout { display: none; }
      .brand-title { display: none; }
    }
    @media (max-width: 520px) {
      .user-meta { display: none; }
      .user-chip { padding: 5px; }
    }
  `],
})
export class ShellComponent {
  readonly portalUrl = PORTAL_URL;
  readonly secciones = SECCIONES;

  mobileOpen = signal(false);
  userOpen = signal(false);

  nombre = computed(() => this.auth.usuario()?.nombre || 'Usuario');
  iniciales = computed(() => {
    const partes = String(this.nombre()).trim().split(/\s+/);
    return ((partes[0]?.[0] || '') + (partes[1]?.[0] || '')).toUpperCase() || '?';
  });

  constructor(public auth: AuthService) {}

  toggleMenu(e: Event) { e.stopPropagation(); this.userOpen.set(false); this.mobileOpen.update((v) => !v); }
  toggleUser(e: Event) { e.stopPropagation(); this.mobileOpen.set(false); this.userOpen.update((v) => !v); }
  cerrarMenus() { this.mobileOpen.set(false); this.userOpen.set(false); }

  @HostListener('document:keydown.escape') onEsc() { this.cerrarMenus(); }

  logout(): void {
    this.cerrarMenus();
    this.auth.logout();
  }
}
