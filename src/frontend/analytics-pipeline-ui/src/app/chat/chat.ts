import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '../../services/http-client';

@Component({
  selector: 'app-chat',
  imports: [],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
  standalone: true,
})
export class Chat {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loadingState = signal(false);

  readonly loading = this.loadingState.asReadonly();
  readonly sessionId = this.activatedRoute.snapshot.data['sessionId'];

  constructor(readonly httpClient: HttpClient) {}

  public sendQuery(): void {
    if (this.loading()) {
      return;
    }

    this.loadingState.set(true);
    const query = 'What is the most popular genre?';

    this.httpClient
      .sendQuery(query, this.sessionId)
      .pipe(
        finalize(() => this.loadingState.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          console.log('Agent response:', response);
        },
        error: (error) => {
          console.error('Error sending query:', error);
        },
      });
  }
}
