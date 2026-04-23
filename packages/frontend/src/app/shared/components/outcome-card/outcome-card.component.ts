import { DecimalPipe, JsonPipe, UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import type { CaseOutcome } from '../../../types/index.js';

@Component({
  selector: 'app-outcome-card',
  standalone: true,
  imports: [
    DecimalPipe,
    JsonPipe,
    UpperCasePipe,
    MatCardModule,
    MatChipsModule,
    MatExpansionModule,
    MatIconModule,
    MatDividerModule,
    MatButtonModule,
  ],
  templateUrl: './outcome-card.component.html',
  styleUrl: './outcome-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OutcomeCardComponent {
  outcome = input.required<CaseOutcome>();

  showInternalNote = signal(false);

  toggleInternalNote(): void {
    this.showInternalNote.set(!this.showInternalNote());
  }
}
