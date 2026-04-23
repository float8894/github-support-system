import { JsonPipe, UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import type { AgentEvent } from '../../../types/index.js';

const EVENT_ICONS: Record<string, string> = {
  triage: 'search',
  routing: 'alt_route',
  agent_start: 'play_circle',
  agent_done: 'check_circle',
  rag_retrieved: 'library_books',
  tool_called: 'build',
  verdict: 'gavel',
  complete: 'done_all',
  error: 'error',
};

@Component({
  selector: 'app-agent-event-card',
  standalone: true,
  imports: [
    JsonPipe,
    UpperCasePipe,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './agent-event-card.component.html',
  styleUrl: './agent-event-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentEventCardComponent {
  event = input.required<AgentEvent>();

  expanded = signal(false);

  icon = computed(() => EVENT_ICONS[this.event().event] ?? 'info');
  hasData = computed(
    () =>
      this.event().data !== undefined &&
      Object.keys(this.event().data ?? {}).length > 0,
  );
  formattedTime = computed(() =>
    new Date(this.event().timestamp).toLocaleTimeString(),
  );

  toggleExpand(): void {
    this.expanded.set(!this.expanded());
  }
}
