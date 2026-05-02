import { DecimalPipe, JsonPipe, UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import type { CaseOutcome } from '../../../types/index';

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
  private sanitizer = inject(DomSanitizer);

  outcome = input.required<CaseOutcome>();

  showInternalNote = signal(false);

  toggleInternalNote(): void {
    this.showInternalNote.set(!this.showInternalNote());
  }

  md(text: string): SafeHtml {
    const html = text
      // Escape HTML entities first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Headings
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bold + italic
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Links  [text](url)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
      )
      // Unordered list items
      .replace(/^[*\-] (.+)$/gm, '<li>$1</li>')
      // Numbered list items
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // Wrap consecutive <li> in <ul>
      .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
      // Paragraphs: blank line → paragraph break
      .replace(/\n{2,}/g, '</p><p>')
      // Single newlines → <br>
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(`<p>${html}</p>`);
  }
}
