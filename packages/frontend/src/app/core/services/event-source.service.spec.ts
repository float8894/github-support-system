import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../types/index';
import { EventSourceService } from './event-source.service';

const makeEvent = (type: AgentEvent['event']): AgentEvent => ({
  event: type,
  message: `${type} message`,
  timestamp: new Date().toISOString(),
});

describe('EventSourceService', () => {
  let service: EventSourceService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [EventSourceService] });
    service = TestBed.inject(EventSourceService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runCase emits parsed AgentEvents from fetch stream', async () => {
    const events: AgentEvent[] = [
      makeEvent('triage'),
      makeEvent('routing'),
      makeEvent('complete'),
    ];

    const sseLines = events
      .map((e) => `data: ${JSON.stringify(e)}\n\n`)
      .join('');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseLines));
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      }),
    );

    const received: AgentEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      service.runCase('test-case-id').subscribe({
        next: (e) => received.push(e),
        complete: () => resolve(),
        error: reject,
      });
    });

    expect(received).toHaveLength(3);
    expect(received[0].event).toBe('triage');
    expect(received[2].event).toBe('complete');
  });

  it('runCase errors when fetch returns non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 500, statusText: 'Error' }),
    );

    await expect(
      new Promise<void>((resolve, reject) => {
        service
          .runCase('bad-id')
          .subscribe({ complete: resolve, error: reject });
      }),
    ).rejects.toThrow('HTTP 500');
  });

  it('unsubscribing before completion aborts fetch without emitting an error', () => {
    // fetch never resolves — simulates a hanging request
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );

    let hadError = false;
    const sub = service.runCase('abort-id').subscribe({
      error: () => {
        hadError = true;
      },
    });
    // Unsubscribing triggers AbortController.abort() in the teardown
    sub.unsubscribe();
    expect(hadError).toBe(false);
  });
});
