import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import type { CaseSeverity } from '../../../types/index';

@Component({
  selector: 'app-severity-badge',
  standalone: true,
  imports: [MatChipsModule],
  templateUrl: './severity-badge.component.html',
  styleUrl: './severity-badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeverityBadgeComponent {
  severity = input.required<CaseSeverity>();
}
