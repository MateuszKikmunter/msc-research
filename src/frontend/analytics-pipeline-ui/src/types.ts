export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AgentMetrics {
  totalSteps: number;
  modelInvocations: number;
  actionInvocations: number;
}

export interface AgentResponse {
  answer: string;
  foundationModel: string | null;
  elapsedTimeSeconds: number;
  tokenUsage: TokenUsage;
  agentMetrics: AgentMetrics;
}
