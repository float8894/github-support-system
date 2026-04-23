import { provideHttpClient } from '@angular/common/http';
import {
  provideZonelessChangeDetection,
  type ApplicationConfig,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes.js';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideAnimationsAsync(),
    provideHttpClient(),
    provideRouter(routes),
  ],
};
