import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CaseService } from '../../core/services/case.service';
import { EventSourceService } from '../../core/services/event-source.service';
import { AgentEventCardComponent } from '../../shared/components/agent-event-card/agent-event-card.component';
import { OutcomeCardComponent } from '../../shared/components/outcome-card/outcome-card.component';
import type { AgentEvent, CaseOutcome } from '../../types/index';

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
export class CaseDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private caseService = inject(CaseService);
  private eventSourceService = inject(EventSourceService);

  agentEvents = signal<AgentEvent[]>([]);
  outcome = signal<CaseOutcome | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  caseId = signal('');

  isRunning = computed(() => this.loading() && this.outcome() === null);
  isComplete = computed(() => this.outcome() !== null);

  private sub: Subscription | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.caseId.set(id);
    this.startPipeline(id);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private startPipeline(caseId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.sub = this.eventSourceService.runCase(caseId).subscribe({
      next: (event) => {
        this.agentEvents.update((prev) => [...prev, event]);
        if (event.event === 'complete') {
          this.fetchOutcome(caseId);
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
      complete: () => {
        // fetchOutcome handles setting loading to false
      },
    });
  }

  private fetchOutcome(caseId: string): void {
    this.caseService.getOutcome(caseId).subscribe({
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
