import { Routes } from '@angular/router';

// El acceso lo controla Azure Easy Auth + el padrón `acceso` a nivel backend,
// así que acá no hay guard ni pantalla de login.
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'contratos',
        loadComponent: () =>
          import('./pages/contratos/contratos-list.component').then((m) => m.ContratosListComponent),
      },
      {
        path: 'contratos/nuevo',
        loadComponent: () =>
          import('./pages/contratos/contrato-form.component').then((m) => m.ContratoFormComponent),
      },
      {
        path: 'contratos/:id',
        loadComponent: () =>
          import('./pages/contratos/contrato-form.component').then((m) => m.ContratoFormComponent),
      },
      {
        path: 'proveedores',
        loadComponent: () =>
          import('./pages/proveedores/proveedores-list.component').then((m) => m.ProveedoresListComponent),
      },
      {
        path: 'sectores',
        loadComponent: () =>
          import('./pages/sectores/sectores-list.component').then((m) => m.SectoresListComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
