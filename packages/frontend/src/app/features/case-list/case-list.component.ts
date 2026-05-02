import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { CaseService } from '../../core/services/case.service';
import type { CaseStatus, IssueCategory, SupportCase } from '../../types/index';

@Component({
  selector: 'app-case-list',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './case-list.component.html',
  styleUrl: './case-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseListComponent {
  private caseService = inject(CaseService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  cases = signal<SupportCase[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  deletingId = signal<string | null>(null);
  filterStatus = signal<CaseStatus | 'all'>('all');

  filtered = computed(() => {
    const f = this.filterStatus();
    return f === 'all'
      ? this.cases()
      : this.cases().filter((c) => c.status === f);
  });

  readonly statuses: Array<{ value: CaseStatus | 'all'; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'escalated', label: 'Escalated' },
    { value: 'pending_clarification', label: 'Pending' },
  ];

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.caseService
      .listCases()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cases) => {
          this.cases.set(cases);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load cases. Is the backend running?');
          this.loading.set(false);
        },
      });
  }

  viewCase(caseId: string): void {
    void this.router.navigate(['/cases', caseId]);
  }

  deleteCase(c: SupportCase, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Delete case "${c.title}"? This cannot be undone.`)) return;
    this.deletingId.set(c.case_id);
    this.caseService
      .deleteCase(c.case_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cases.update((list) =>
            list.filter((x) => x.case_id !== c.case_id),
          );
          this.deletingId.set(null);
        },
        error: () => {
          this.deletingId.set(null);
        },
      });
  }

  runCase(caseId: string, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/cases', caseId]);
  }

  categoryLabel(cat: IssueCategory | undefined): string {
    if (!cat) return '—';
    return cat.replace(/_/g, ' ');
  }

  relativeTime(iso: string | undefined): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
}
