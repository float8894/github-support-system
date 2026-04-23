import { TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { CaseService } from '../../core/services/case.service.js';
import type { CaseSeverity } from '../../types/index.js';

@Component({
  selector: 'app-case-submit',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TitleCasePipe,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './case-submit.component.html',
  styleUrl: './case-submit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseSubmitComponent {
  private fb = inject(FormBuilder);
  private caseService = inject(CaseService);
  private router = inject(Router);

  loading = signal(false);
  error = signal<string | null>(null);

  readonly severities: CaseSeverity[] = ['low', 'medium', 'high', 'critical'];

  caseForm = this.fb.nonNullable.group({
    title: [
      '',
      [Validators.required, Validators.minLength(5), Validators.maxLength(500)],
    ],
    description: ['', [Validators.required, Validators.minLength(10)]],
    severity: ['medium' as CaseSeverity, Validators.required],
    customer_id: [
      '',
      [Validators.required, Validators.pattern(/^[0-9a-f-]{36}$/i)],
    ],
    org_id: ['', [Validators.required, Validators.pattern(/^[0-9a-f-]{36}$/i)]],
  });

  onSubmit(): void {
    if (this.caseForm.invalid) {
      this.caseForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    this.caseService.createCase(this.caseForm.getRawValue()).subscribe({
      next: ({ case_id }) => {
        this.loading.set(false);
        void this.router.navigate(['/cases', case_id]);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(
          err instanceof Error ? err.message : 'Failed to create case',
        );
      },
    });
  }
}
