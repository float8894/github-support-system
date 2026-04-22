# Angular 21 Skill

## Project location

```
packages/frontend/src/app/
  core/services/          — injectable services
  shared/components/      — reusable UI components
  features/
    case-submit/          — new case form
    case-detail/          — single case view + SSE stream
    scenario-runner/      — test scenario trigger panel
```

---

## Mandatory Component Structure

Every component **must** have all four of these:

```typescript
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
} from '@angular/core';

@Component({
  selector: 'app-example',
  standalone: true, // ✅ always
  imports: [MatButtonModule, MatCardModule], // specific imports only
  templateUrl: './example.component.html',
  styleUrl: './example.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush, // ✅ always
})
export class ExampleComponent implements OnInit {
  // ✅ inject() — never constructor injection
  private caseService = inject(CaseService);

  // ✅ signal() for all mutable state
  cases = signal<SupportCase[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  // ✅ computed() for derived state
  caseCount = computed(() => this.cases().length);
  hasCases = computed(() => this.cases().length > 0);

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.caseService.getAll().subscribe({
      next: (cases) => {
        this.cases.set(cases);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message);
        this.loading.set(false);
      },
    });
  }
}
```

### Anti-patterns — never suggest these

```typescript
// ❌ constructor injection
constructor(private http: HttpClient) {}

// ❌ BehaviorSubject for component-local state
status$ = new BehaviorSubject<string>('idle');

// ❌ new FormGroup / FormControl
form = new FormGroup({ name: new FormControl('') });
```

---

## Template Syntax — New Control Flow Only

```html
<!-- ✅ @if / @else if / @else -->
@if (loading()) {
<mat-spinner />
} @else if (error()) {
<p class="error">{{ error() }}</p>
} @else if (hasCases()) { @for (c of cases(); track c.case_id) {
<app-case-card [caseData]="c" />
} } @else {
<p>No cases found.</p>
}

<!-- ❌ Never use structural directives -->
<!-- *ngIf, *ngFor, *ngSwitch, [ngClass] (prefer class binding) -->
```

---

## Signal Forms

```typescript
import { form, field, Validators } from '@angular/forms';

caseForm = form({
  subject:     field('', { validators: [Validators.required, Validators.minLength(5)] }),
  description: field('', { validators: [Validators.required] }),
  severity:    field<'low' | 'medium' | 'high' | 'critical'>('medium'),
  org_id:      field('', { validators: [Validators.required] }),
});

// Access values
const subject = this.caseForm.controls.subject.value();

// Submit
onSubmit(): void {
  if (this.caseForm.valid()) {
    this.caseService.create(this.caseForm.value()).subscribe(...);
  }
}
```

---

## App Config (main.ts / app.config.ts)

```typescript
import {
  provideExperimentalZonelessChangeDetection,
  provideAnimationsAsync,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(), // ✅ required
    provideAnimationsAsync(), // ✅ required
    provideHttpClient(),
    provideRouter(routes),
  ],
};
```

---

## SSE Streaming (case-detail)

```typescript
import { inject } from '@angular/core';
import { EventSourceService } from '../core/services/event-source.service.js';

export class CaseDetailComponent {
  private events = inject(EventSourceService);

  agentEvents = signal<AgentEvent[]>([]);

  connectToCase(caseId: string): void {
    this.events.connect(`/api/cases/${caseId}/stream`).subscribe({
      next: (event) => this.agentEvents.update((prev) => [...prev, event]),
    });
  }
}
```

---

## File Naming

```
case-submit/
  case-submit.component.ts
  case-submit.component.html
  case-submit.component.scss
  case-submit.component.spec.ts
```

One folder per component. No `index.ts` barrel files unless the feature exports multiple components.

---

## Angular Material

Import only what is used. No wildcard `MatModule` imports.

```typescript
imports: [
  MatCardModule,
  MatButtonModule,
  MatFormFieldModule,
  MatInputModule,
  MatSelectModule,
  MatProgressSpinnerModule,
  MatChipsModule,
];
```
