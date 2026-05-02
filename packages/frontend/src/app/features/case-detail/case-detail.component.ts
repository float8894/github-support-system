import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CaseService } from '../../core/services/case.service';
import { EventSourceService } from '../../core/services/event-source.service';
import { AgentEventCardComponent } from '../../shared/components/agent-event-card/agent-event-card.component';
import { OutcomeCardComponent } from '../../shared/components/outcome-card/outcome-card.component';
import type { AgentEvent, CaseOutcome, SupportCase } from '../../types/index';

@Component({
  selector: 'app-case-detail',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    AgentEventCardComponent,
    OutcomeCardComponent,
  ],
  templateUrl: './case-detail.component.html',
  styleUrl: './case-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaseDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private caseService = inject(CaseService);
  private eventSourceService = inject(EventSourceService);
  private destroyRef = inject(DestroyRef);

  agentEvents = signal<AgentEvent[]>([]);
  outcome = signal<CaseOutcome | null>(null);
  previousOutcome = signal<CaseOutcome | null>(null);
  caseDetails = signal<SupportCase | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  caseId = signal('');
  pipelineStarted = signal(false);

  isRunning = computed(
    () => this.pipelineStarted() && this.loading() && this.outcome() === null,
  );
  isComplete = computed(() => this.outcome() !== null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.caseId.set(id);
    this.fetchCaseDetails(id);
    this.loadPreviousOutcome(id);
  }

  private fetchCaseDetails(caseId: string): void {
    this.caseService
      .getCase(caseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => this.caseDetails.set(c),
        error: () => {
          // non-critical
        },
      });
  }

  private loadPreviousOutcome(caseId: string): void {
    this.caseService
      .getOutcome(caseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.previousOutcome.set(result),
        error: () => {
          // 404 = never run yet — expected
        },
      });
  }

  runPipeline(): void {
    this.pipelineStarted.set(true);
    this.previousOutcome.set(null);
    this.agentEvents.set([]);
    this.outcome.set(null);
    this.error.set(null);
    this.loading.set(true);

    this.eventSourceService
      .runCase(this.caseId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          this.agentEvents.update((prev) => [...prev, event]);
          if (event.event === 'complete') {
            this.fetchOutcome(this.caseId());
          }
          if (event.event === 'error') {
            this.loading.set(false);
            this.error.set(event.message);
          }
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(err instanceof Error ? err.message : 'Stream failed');
        },
      });
  }

  private fetchOutcome(caseId: string): void {
    this.caseService
      .getOutcome(caseId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.outcome.set(result);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          this.error.set(
            err instanceof Error ? err.message : 'Failed to load outcome',
          );
        },
      });
  }
}
