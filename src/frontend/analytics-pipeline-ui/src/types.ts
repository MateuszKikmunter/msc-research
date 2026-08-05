export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentResponse {
  answer: string;
  elapsedTimeSeconds: number;
  tokenUsage: TokenUsage;
}
