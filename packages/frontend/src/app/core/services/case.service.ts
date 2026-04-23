import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CaseOutcome,
  CreateCaseRequest,
  SupportCase,
} from '../../types/index';

@Injectable({ providedIn: 'root' })
export class CaseService {
  private http = inject(HttpClient);

  createCase(payload: CreateCaseRequest): Observable<{ case_id: string }> {
    return this.http.post<{ case_id: string }>('/api/cases', payload);
  }

  getOutcome(caseId: string): Observable<CaseOutcome> {
    return this.http.get<CaseOutcome>(`/api/cases/${caseId}`);
  }

  listCases(): Observable<SupportCase[]> {
    return this.http.get<SupportCase[]>('/api/cases');
  }
}
