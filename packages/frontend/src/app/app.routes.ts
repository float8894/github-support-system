import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/case-submit/case-submit.component').then(
        (m) => m.CaseSubmitComponent,
      ),
  },
  {
    path: 'cases/:id',
    loadComponent: () =>
      import('./features/case-detail/case-detail.component').then(
        (m) => m.CaseDetailComponent,
      ),
  },
  {
    path: 'cases',
    loadComponent: () =>
      import('./features/case-list/case-list.component').then(
        (m) => m.CaseListComponent,
      ),
  },
  {
    path: 'scenarios',
    loadComponent: () =>
      import('./features/scenario-runner/scenario-runner.component').then(
        (m) => m.ScenarioRunnerComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
