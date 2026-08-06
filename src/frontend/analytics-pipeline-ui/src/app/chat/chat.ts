import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatButton } from '@angular/material/button';
import { MatProgressSpinner } from '@angular/material/progress-spinner';

import { HttpClient } from '../../services/http-client';
import { AgentResponse } from '../../types';
import { FormsModule } from '@angular/forms';
@Component({
  selector: 'app-chat',
  imports: [MatButton, MatProgressSpinner, CommonModule, FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
  standalone: true,
})
export class Chat {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loadingState = signal(false);
  private readonly agentResponse = signal<AgentResponse | undefined>(undefined);

  readonly loading = this.loadingState.asReadonly();
  readonly response = this.agentResponse.asReadonly();
  readonly sessionId = this.activatedRoute.snapshot.data['sessionId'];

  public query = 'Enter your query here...';

  constructor(readonly httpClient: HttpClient) {}

  public sendQuery(): void {
    if (this.loading()) {
      return;
    }

    this.loadingState.set(true);
    this.agentResponse.set(undefined);
    const query = 'What is the most popular genre?';

    this.httpClient
      .sendQuery(query, this.sessionId)
      .pipe(
        finalize(() => this.loadingState.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.agentResponse.set(response);
          console.log('Agent response:', response);
        },
        error: (error) => {
          console.error('Error sending query:', error);
        },
      });
  }
}
