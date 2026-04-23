import {
  provideZonelessChangeDetection,
  ɵresolveComponentResources as resolveComponentResources,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { render } from '@testing-library/angular';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { of, Subject, throwError } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CaseService } from '../../core/services/case.service.js';
import { EventSourceService } from '../../core/services/event-source.service.js';
import type { AgentEvent, CaseOutcome } from '../../types/index.js';
import { CaseDetailComponent } from './case-detail.component.js';

const makeEvent = (type: AgentEvent['event']): AgentEvent => ({
  event: type,
  message: `${type} message`,
  timestamp: new Date().toISOString(),
});

const mockOutcome: CaseOutcome = {
  case_id: 'test-id',
  issue_type: 'billing_plan',
  verdict: 'resolve',
  customer_response: 'Here is how to resolve your issue.',
  internal_note: 'Internal details.',
  evidence: {
    doc_citations: [],
    tool_results: [],
    key_findings: ['Finding 1'],
  },
};

const providers = (caseId = 'test-id') => [
  provideZonelessChangeDetection(),
  provideAnimationsAsync(),
  provideRouter([]),
  {
    provide: ActivatedRoute,
    useValue: { snapshot: { paramMap: { get: () => caseId } } },
  },
];

describe('CaseDetailComponent', () => {
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

  it('populates agentEvents when stream emits events', async () => {
    // Use a Subject so the initial render has empty agentEvents (no AgentEventCard rendered)
    // We then push events and check the signal directly without a second detectChanges()
    const events$ = new Subject<AgentEvent>();
    const { fixture } = await render(CaseDetailComponent, {
      providers: [
        ...providers(),
        {
          provide: EventSourceService,
          useValue: { runCase: vi.fn(() => events$.asObservable()) },
        },
        {
          provide: CaseService,
          useValue: { getOutcome: vi.fn(() => of(mockOutcome)) },
        },
      ],
    });
    fixture.detectChanges(); // initial render: agentEvents is empty – no AgentEventCard rendered
    events$.next(makeEvent('triage'));
    events$.next(makeEvent('routing'));
    expect(fixture.componentInstance.agentEvents().length).toBe(2);
  });

  it('fetches outcome when complete event arrives', async () => {
    const events$ = new Subject<AgentEvent>();
    const mockCaseSvc = { getOutcome: vi.fn(() => of(mockOutcome)) };
    const { fixture } = await render(CaseDetailComponent, {
      providers: [
        ...providers(),
        {
          provide: EventSourceService,
          useValue: { runCase: vi.fn(() => events$.asObservable()) },
        },
        { provide: CaseService, useValue: mockCaseSvc },
      ],
    });
    fixture.detectChanges();
    events$.next(makeEvent('triage'));
    events$.next(makeEvent('complete'));
    const component = fixture.componentInstance;
    expect(mockCaseSvc.getOutcome).toHaveBeenCalledWith('test-id');
    expect(component.outcome()).toEqual(mockOutcome);
    expect(component.isComplete()).toBe(true);
  });

  it('sets error signal when stream errors', async () => {
    const { fixture } = await render(CaseDetailComponent, {
      providers: [
        ...providers(),
        {
          provide: EventSourceService,
          useValue: {
            runCase: vi.fn(() => throwError(() => new Error('Stream failed'))),
          },
        },
        { provide: CaseService, useValue: { getOutcome: vi.fn() } },
      ],
    });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.error()).toBe('Stream failed');
    expect(component.loading()).toBe(false);
  });
});
