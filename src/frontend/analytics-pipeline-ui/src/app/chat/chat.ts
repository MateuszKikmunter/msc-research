import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-chat',
  imports: [],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
  standalone: true,
})
export class Chat {
  private activatedRoute = inject(ActivatedRoute);
  readonly sessionId = this.activatedRoute.snapshot.data['sessionId'];

  constructor() {}
}
