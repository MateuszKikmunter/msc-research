import { CommonModule } from '@angular/common';
import { Component, DestroyRef, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TextFieldModule } from '@angular/cdk/text-field';

import { HttpClient } from '../../services/http-client';
import { AgentResponse } from '../../types';
import { ThemeService } from '../../services/theme';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  sentAt: Date;
  response?: AgentResponse;
  isError?: boolean;
}

@Component({
  selector: 'app-chat',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatToolbarModule,
    MatTooltipModule,
    TextFieldModule,
  ],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
  standalone: true,
})
export class Chat {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loadingState = signal(false);
  private nextMessageId = 1;

  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;

  readonly loading = this.loadingState.asReadonly();
  readonly messages = signal<ChatMessage[]>([]);
  readonly sessionId = this.activatedRoute.snapshot.data['sessionId'] as string;

  query = '';

  constructor(
    private readonly httpClient: HttpClient,
    readonly theme: ThemeService,
  ) {}

  sendQuery(): void {
    const query = this.query.trim();
    if (this.loading() || !query) {
      return;
    }

    this.appendMessage({ role: 'user', content: query, sentAt: new Date() });
    this.query = '';
    this.loadingState.set(true);

    this.httpClient
      .sendQuery(query, this.sessionId)
      .pipe(
        finalize(() => this.loadingState.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.appendMessage({
            role: 'assistant',
            content: response.answer,
            sentAt: new Date(),
            response,
          });
        },
        error: () => {
          this.appendMessage({
            role: 'assistant',
            content: 'I could not complete that request. Please try again.',
            sentAt: new Date(),
            isError: true,
          });
        },
      });
  }

  handleEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    this.sendQuery();
  }

  private appendMessage(message: Omit<ChatMessage, 'id'>): void {
    this.messages.update((messages) => [...messages, { ...message, id: this.nextMessageId++ }]);
    queueMicrotask(() => {
      const element = this.messageList?.nativeElement;
      if (element?.scrollTo) {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      }
    });
  }
}
