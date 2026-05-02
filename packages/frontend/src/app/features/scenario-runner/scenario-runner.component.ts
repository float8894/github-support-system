import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { CaseService } from '../../core/services/case.service';
import type { CaseSeverity, SupportCase } from '../../types/index';

interface ScenarioCard {
  id: number;
  title: string;
  description: string;
  expectedVerdict: string;
  primaryAgent: string;
  /** Unique substring of the seeded case title in the DB */
  seedKeyword: string;
}

const SCENARIOS: ScenarioCard[] = [
  {
    id: 1,
    title: 'Feature Entitlement Dispute',
    description: 'GitHub Actions minutes not available on Team plan.',
    expectedVerdict: 'resolve / escalate',
    primaryAgent: 'EntitlementsAgent',
    seedKeyword: 'GitHub Actions minutes',
  },
  {
    id: 2,
    title: 'Paid Features Locked',
    description: 'All premium Enterprise features suddenly unavailable.',
    expectedVerdict: 'resolve',
    primaryAgent: 'BillingPlanAgent',
    seedKeyword: 'All premium features',
  },
  {
    id: 3,
    title: 'PAT Failing for Org Resources',
    description: 'Personal Access Token returns 403 for organization repos.',
    expectedVerdict: 'resolve',
    primaryAgent: 'AuthTokenAgent',
    seedKeyword: 'Personal Access Token returns',
  },
  {
    id: 4,
    title: 'REST API Rate Limit Complaint',
    description: 'Rate-limit errors even when well under the hourly cap.',
    expectedVerdict: 'resolve',
    primaryAgent: 'ApiRateLimitAgent',
    seedKeyword: 'Getting rate limited',
  },
  {
    id: 5,
    title: 'SAML SSO Login Failure',
    description: 'Users cannot log in via SAML SSO; Okta shows success.',
    expectedVerdict: 'resolve / escalate',
    primaryAgent: 'AuthTokenAgent',
    seedKeyword: 'SAML SSO authentication',
  },
  {
    id: 6,
    title: 'Repeated Unresolved Auth Issues',
    description: 'Fourth auth failure in two weeks — none previously resolved.',
    expectedVerdict: 'escalate',
    primaryAgent: 'AuthTokenAgent',
    seedKeyword: 'Yet another token authentication',
  },
  {
    id: 7,
    title: 'Ambiguous Complaint',
    description: '"GitHub is not working for us. Please fix."',
    expectedVerdict: 'clarify',
    primaryAgent: 'OrchestratorAgent',
    seedKeyword: 'GitHub not working',
  },
  {
    id: 8,
    title: 'Billing + Technical Issue',
    description:
      'Cannot access Advanced Security after confirmed Enterprise upgrade.',
    expectedVerdict: 'resolve / escalate',
    primaryAgent: 'BillingPlanAgent',
    seedKeyword: 'Cannot access Advanced Security',
  },
];

@Component({
  selector: 'app-scenario-runner',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatIconModule,
    MatDividerModule,
  ],
  templateUrl: './scenario-runner.component.html',
  styleUrl: './scenario-runner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioRunnerComponent implements OnInit {
  private caseService = inject(CaseService);
  private router = inject(Router);

  scenarios = SCENARIOS;
  seededCases = signal<SupportCase[]>([]);
  loadingCases = signal(true);
  runningScenarioId = signal<number | null>(null);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.caseService.listCases().subscribe({
      next: (cases) => {
        this.seededCases.set(cases);
        this.loadingCases.set(false);
      },
      error: (err: unknown) => {
        this.loadingCases.set(false);
        this.error.set(
          err instanceof Error ? err.message : 'Failed to load cases',
        );
      },
    });
  }

  getCaseForScenario(scenario: ScenarioCard): SupportCase | undefined {
    return this.seededCases().find((c) =>
      c.title.toLowerCase().includes(scenario.seedKeyword.toLowerCase()),
    );
  }

  getActualVerdict(scenario: ScenarioCard): string | null {
    const c = this.getCaseForScenario(scenario);
    if (!c) return null;
    switch (c.status) {
      case 'resolved':
        return 'resolve';
      case 'escalated':
        return 'escalate';
      case 'pending_clarification':
        return 'clarify';
      default:
        return null;
    }
  }

  verdictMatches(scenario: ScenarioCard): boolean | null {
    const actual = this.getActualVerdict(scenario);
    if (actual === null) return null;
    return scenario.expectedVerdict.includes(actual);
  }

  runScenario(scenario: ScenarioCard): void {
    const existingCase = this.getCaseForScenario(scenario);
    if (existingCase) {
      void this.router.navigate(['/cases', existingCase.case_id]);
      return;
    }
    // fallback: create a new case using the first available seeded customer/org
    const firstCase = this.seededCases()[0];
    if (!firstCase) {
      this.error.set('No seeded data found. Run `npm run db:seed` first.');
      return;
    }
    this.runningScenarioId.set(scenario.id);
    this.error.set(null);

    this.caseService
      .createCase({
        customer_id: firstCase.customer_id,
        org_id: firstCase.org_id,
        title: scenario.title,
        description: scenario.description,
        severity: 'medium' as CaseSeverity,
      })
      .subscribe({
        next: ({ case_id }) => {
          this.runningScenarioId.set(null);
          void this.router.navigate(['/cases', case_id]);
        },
        error: (err: unknown) => {
          this.runningScenarioId.set(null);
          this.error.set(
            err instanceof Error ? err.message : 'Failed to create case',
          );
        },
      });
  }

  getVerdictClass(verdict: string): string {
    if (verdict.includes('resolve') && verdict.includes('escalate'))
      return 'mixed';
    if (verdict.startsWith('resolve')) return 'resolve';
    if (verdict.startsWith('escalate')) return 'escalate';
    if (verdict.startsWith('clarify')) return 'clarify';
    return 'mixed';
  }
}
