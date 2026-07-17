import {
  ApplicationConfig, provideZoneChangeDetection, LOCALE_ID,
  provideAppInitializer, inject,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

import { routes } from './app.routes';
import { AuthService } from './core/auth.service';

registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    // Trae la identidad de Easy Auth antes de renderizar (para el chip de usuario).
    provideAppInitializer(() => inject(AuthService).cargar()),
    { provide: LOCALE_ID, useValue: 'es' },
  ],
};
