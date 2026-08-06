import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { Chat } from './chat';
import { HttpClient } from '../../services/http-client';
import { AgentResponse } from '../../types';

describe('Chat', () => {
  let component: Chat;
  let fixture: ComponentFixture<Chat>;
  let sendQuery: ReturnType<typeof vi.fn>;

  const response: AgentResponse = {
    answer: 'Rock is the most popular genre.',
    foundationModel: 'amazon.nova-lite-v1:0',
    elapsedTimeSeconds: 1.4,
    tokenUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
    agentMetrics: { totalSteps: 2, modelInvocations: 3, actionInvocations: 1 },
  };

  beforeEach(async () => {
    sendQuery = vi.fn().mockReturnValue(of(response));

    await TestBed.configureTestingModule({
      imports: [Chat],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { sessionId: 'test-session' } } },
        },
        { provide: HttpClient, useValue: { sendQuery } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Chat);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the question and answer in the conversation', () => {
    component.query = 'What is the most popular genre?';
    component.sendQuery();

    expect(sendQuery).toHaveBeenCalledWith('What is the most popular genre?', 'test-session');
    expect(component.messages()).toHaveLength(2);
    expect(component.messages()[0].content).toBe('What is the most popular genre?');
    expect(component.messages()[1].response).toEqual(response);
    expect(component.query).toBe('');
  });
});
