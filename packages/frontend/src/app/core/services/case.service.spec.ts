import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CaseOutcome, SupportCase } from '../../types/index.js';
import { CaseService } from './case.service.js';

describe('CaseService', () => {
  let service: CaseService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), CaseService],
    });
    service = TestBed.inject(CaseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('createCase posts to /api/cases and returns case_id', () => {
    const payload = {
      customer_id: 'cust-uuid',
      org_id: 'org-uuid',
      title: 'Test Case Title',
      description: 'Some description here for the test',
      severity: 'medium' as const,
    };
    const mockResponse = { case_id: 'new-case-uuid' };

    service.createCase(payload).subscribe((res) => {
      expect(res.case_id).toBe('new-case-uuid');
    });

    const req = httpMock.expectOne('/api/cases');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(mockResponse);
  });

  it('getOutcome GETs /api/cases/:id and returns CaseOutcome', () => {
    const caseId = 'test-case-id';
    const mockOutcome: Partial<CaseOutcome> = {
      case_id: caseId,
      verdict: 'resolve',
      issue_type: 'billing_plan',
    };

    service.getOutcome(caseId).subscribe((outcome) => {
      expect(outcome.case_id).toBe(caseId);
      expect(outcome.verdict).toBe('resolve');
    });

    const req = httpMock.expectOne(`/api/cases/${caseId}`);
    expect(req.request.method).toBe('GET');
    req.flush(mockOutcome);
  });

  it('listCases GETs /api/cases', () => {
    const mockCases: Partial<SupportCase>[] = [
      { case_id: 'id-1', title: 'Case A', status: 'open', severity: 'low' },
      {
        case_id: 'id-2',
        title: 'Case B',
        status: 'resolved',
        severity: 'high',
      },
    ];

    service.listCases().subscribe((cases) => {
      expect(cases).toHaveLength(2);
      expect(cases[0].case_id).toBe('id-1');
    });

    const req = httpMock.expectOne('/api/cases');
    expect(req.request.method).toBe('GET');
    req.flush(mockCases);
  });
});
