import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import type { AgentEvent } from '../../types/index.js';

@Injectable({ providedIn: 'root' })
export class EventSourceService {
  /**
   * POST to /api/cases/:id/run and stream the SSE response.
   * Uses fetch + ReadableStream so it works with POST (EventSource only supports GET).
   */
  runCase(caseId: string): Observable<AgentEvent> {
    return new Observable<AgentEvent>((observer) => {
      const controller = new AbortController();

      fetch(`/api/cases/${caseId}/run`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      })
        .then(async (response) => {
          if (!response.ok) {
            observer.error(
              new Error(`HTTP ${response.status}: ${response.statusText}`),
            );
            return;
          }
          const reader = response.body?.getReader();
          if (!reader) {
            observer.error(new Error('Response body is not readable'));
            return;
          }
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop() ?? '';
            for (const part of parts) {
              const line = part.trim();
              if (line.startsWith('data: ')) {
                try {
                  const event = JSON.parse(line.slice(6)) as AgentEvent;
                  observer.next(event);
                  if (event.event === 'complete' || event.event === 'error') {
                    observer.complete();
                    return;
                  }
                } catch {
                  // skip malformed SSE line
                }
              }
            }
          }
          observer.complete();
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') {
            observer.complete();
          } else {
            observer.error(err);
          }
        });

      return () => controller.abort();
    });
  }

  /**
   * Replay stored SSE events from GET /api/cases/:id/stream (after run completes).
   */
  replayCase(caseId: string): Observable<AgentEvent> {
    return new Observable<AgentEvent>((observer) => {
      const es = new EventSource(`/api/cases/${caseId}/stream`);
      es.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data as string) as AgentEvent;
          observer.next(event);
        } catch {
          // skip malformed
        }
      };
      es.onerror = () => {
        es.close();
        observer.complete();
      };
      return () => es.close();
    });
  }
}
