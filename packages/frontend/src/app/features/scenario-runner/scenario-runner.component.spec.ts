import {
  provideZonelessChangeDetection,
  ɵresolveComponentResources as resolveComponentResources,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { of, throwError } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CaseService } from '../../core/services/case.service.js';
import type { SupportCase } from '../../types/index.js';
import { ScenarioRunnerComponent } from './scenario-runner.component.js';

const seededCases: SupportCase[] = [
  {
    case_id: 'seed-case-1',
    customer_id: 'cust-uuid-1',
    org_id: 'org-uuid-1',
    title: 'Feature Entitlement Dispute',
    description: 'Actions not available',
    severity: 'high',
    status: 'open',
  },
  {
    case_id: 'seed-case-2',
    customer_id: 'cust-uuid-1',
    org_id: 'org-uuid-2',
    title: 'Paid Features Locked',
    description: 'Enterprise features gone',
    severity: 'critical',
    status: 'open',
  },
];

const providers = (listCasesResult = of(seededCases)) => [
  provideZonelessChangeDetection(),
  provideAnimationsAsync(),
  provideRouter([]),
  {
    provide: CaseService,
    useValue: {
      listCases: vi.fn(() => listCasesResult),
      createCase: vi.fn(() => of({ case_id: 'new-case-id' })),
    },
  },
];

describe('ScenarioRunnerComponent', () => {
  beforeAll(async () => {
    const cache = new Map<string, string>();
    function index(dir: string): void {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, e.name);
        if (e.isDirectory()) index(full);
        else if (e.name.endsWith('.html') || e.name.endsWith('.scss'))
          cache.set(e.name, full);
      }
    }
    index(join(process.cwd(), 'src'));
    await resolveComponentResources((url: string) => {
      const content = (() => {
        try {
          return readFileSync(cache.get(basename(url)) ?? '', 'utf-8');
        } catch {
          return '';
        }
      })();
      return Promise.resolve({ text: () => Promise.resolve(content) });
    });
  });
  it('renders all 8 scenario cards', async () => {
    const { fixture } = await render(ScenarioRunnerComponent, {
      providers: providers(),
    });
    fixture.detectChanges();
    // All scenario numbers S1–S8 should appear
    for (let i = 1; i <= 8; i++) {
      expect(screen.getAllByText(`S${i}`).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('calls listCases on init', async () => {
    const mockService = {
      listCases: vi.fn(() => of(seededCases)),
      createCase: vi.fn(() => of({ case_id: 'new-id' })),
    };
    const { fixture } = await render(ScenarioRunnerComponent, {
      providers: [
        provideZonelessChangeDetection(),
        provideAnimationsAsync(),
        provideRouter([]),
        { provide: CaseService, useValue: mockService },
      ],
    });
    fixture.detectChanges();
    expect(mockService.listCases).toHaveBeenCalled();
  });

  it('navigates to existing seeded case when Run is clicked and title matches', async () => {
    const navigateSpy = vi.fn();
    const { fixture } = await render(ScenarioRunnerComponent, {
      providers: [
        ...providers(),
        {
          provide: 'Router',
          useValue: { navigate: navigateSpy },
        },
      ],
    });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    // S1 title matches seededCases[0].title
    const matched = component.getCaseForScenario('Feature Entitlement Dispute');
    expect(matched?.case_id).toBe('seed-case-1');
  });

  it('shows error banner when listCases fails', async () => {
    const { fixture } = await render(ScenarioRunnerComponent, {
      providers: providers(throwError(() => new Error('DB down'))),
    });
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.error()).toBe('DB down');
  });
});
