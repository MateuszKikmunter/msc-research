import { Injectable } from '@angular/core';
import { Observable } from 'rxjs/internal/Observable';
import { HttpClient as AngularHttpClient } from '@angular/common/http';

import { AgentResponse } from '../types';

@Injectable({ providedIn: 'root' })
export class HttpClient {
  private baseUrl = 'http://localhost:8000/api';

  constructor(private http: AngularHttpClient) {}

  public sendQuery(query: string, sessionId: string): Observable<AgentResponse> {
    const url = `${this.baseUrl}/analytics-pipeline`;
    if (!query.trim()) {
      throw new Error('Query not provided!');
    }

    if (!sessionId.trim()) {
      throw new Error('Session ID not provided!');
    }

    const body = { query, sessionId };
    try {
      return this.http.post<AgentResponse>(url, body);
    } catch (error) {
      console.error('Error sending query:', error);
      throw error;
    }
  }
}
