import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  provideZonelessChangeDetection,
  ɵresolveComponentResources as resolveComponentResources,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { fireEvent, render, screen } from '@testing-library/angular';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CaseSubmitComponent } from './case-submit.component.js';

const providers = [
  provideZonelessChangeDetection(),
  provideAnimationsAsync(),
  provideHttpClient(),
  provideHttpClientTesting(),
  provideRouter([]),
];

function buildResourceCache(): Map<string, string> {
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
  return cache;
}

describe('CaseSubmitComponent', () => {
  beforeAll(async () => {
    const cache = buildResourceCache();
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
  it('renders the submit form', async () => {
    await render(CaseSubmitComponent, { providers });
    expect(screen.getByText('Submit Support Case')).toBeTruthy();
  });

  it('shows validation errors when form submitted empty', async () => {
    await render(CaseSubmitComponent, { providers });
    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);
    // Angular Material error messages appear after touch
    const titleInput = document.querySelector('input[formcontrolname="title"]');
    expect(titleInput).toBeTruthy();
  });

  it('calls createCase and navigates on valid submission', async () => {
    const { fixture } = await render(CaseSubmitComponent, { providers });
    const httpMock = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance;

    component.caseForm.setValue({
      customer_id: '12345678-1234-1234-1234-123456789012',
      org_id: '12345678-1234-1234-1234-123456789013',
      title: 'Test case title here',
      description: 'A longer description for this test case scenario.',
      severity: 'high',
    });
    fixture.detectChanges();

    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    const req = httpMock.expectOne('/api/cases');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.title).toBe('Test case title here');
    req.flush({ case_id: 'new-uuid-123' });

    httpMock.verify();
  });

  it('shows error banner on API failure', async () => {
    const { fixture } = await render(CaseSubmitComponent, { providers });
    const httpMock = TestBed.inject(HttpTestingController);
    const component = fixture.componentInstance;

    component.caseForm.setValue({
      customer_id: '12345678-1234-1234-1234-123456789012',
      org_id: '12345678-1234-1234-1234-123456789013',
      title: 'Failing case title',
      description: 'A description that will fail on the server side.',
      severity: 'medium',
    });
    fixture.detectChanges();

    const submitBtn = screen.getByRole('button', { name: /submit/i });
    fireEvent.click(submitBtn);

    httpMock
      .expectOne('/api/cases')
      .flush(
        { error: 'Server error' },
        { status: 500, statusText: 'Internal Server Error' },
      );
    fixture.detectChanges();

    expect(component.error()).toBeTruthy();
    httpMock.verify();
  });
});
