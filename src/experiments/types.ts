import type { AgentResponse, AgentTraceEvent } from '../backend/types';

export interface ComparisonContract {
    mode: 'exact_result';
    requiredColumns: string[];
    orderMatters: boolean;
    columnOrderMatters: boolean;
    preserveDuplicates: boolean;
    numericTolerance: number;
    rowLimit: number | null;
    topNTiePolicy: string | null;
    compareColumnNames: boolean;
    allowExtraColumns: boolean;
}

export type ExpectedBehavior =
    | 'execute'
    | 'clarify_then_execute'
    | 'execute_sequence'
    | 'refuse_without_query'
    | 'decline_without_query';

export interface BenchmarkTurn {
    question: string;
    gold_sql: string;
    comparison: ComparisonContract;
}

export interface AmbiguityResolution {
    acceptedSlots: string[];
    scriptedReply: string;
    gold_sql: string;
    comparison: ComparisonContract;
}

export interface BenchmarkRecord {
    id: string;
    difficulty: string;
    category: string;
    expected_behavior: ExpectedBehavior;
    question?: string;
    gold_sql?: string | null;
    comparison?: ComparisonContract;
    clarification_target?: string;
    resolution?: AmbiguityResolution;
    safety_target?: string;
    turns?: BenchmarkTurn[];
}

export interface GoldQueryDefinition {
    artifactId: string;
    questionId: string;
    turnNumber: number | null;
    sql: string;
    comparison: ComparisonContract;
}

export interface ResultColumn {
    name: string;
    type: string;
}

export interface TabularResult {
    columns: ResultColumn[];
    rows: Array<Array<string | null>>;
    rowCount: number;
}

export interface AthenaQueryResult extends TabularResult {
    queryExecutionId: string;
}

export interface GoldenResultFile extends TabularResult {
    questionId: string;
    turnNumber: number | null;
}

export type RunnerInputType = 'question' | 'fallback' | 'scripted_reply';

export type StoredTraceEvent = Omit<
    AgentTraceEvent,
    'agentId' | 'agentAliasId' | 'agentVersion' | 'eventTime'
> & {
    eventTime: string | null;
};

export type StoredAgentResponse = Omit<AgentResponse, 'traceEvents'> & {
    traceEvents: StoredTraceEvent[];
};

export interface CandidateQueryExecution {
    attempt: number;
    queryExecutionId: string;
}

export interface CandidateResultReference {
    attempt: number;
    queryExecutionId: string;
    status: 'saved' | 'evaluator_uncertain';
    file: string | null;
    error: string | null;
}

export interface CandidateResultFile extends TabularResult {
    questionId: string;
    turnNumber: number | null;
    interactionOrder: number;
    attempt: number;
    queryExecutionId: string;
}

export interface RunInteraction {
    questionId: string;
    difficulty: string;
    category: string;
    turnNumber: number | null;
    interactionOrder: number;
    inputType: RunnerInputType;
    input: string;
    sessionId: string;
    fallbackUsed: boolean;
    scriptedReplyUsed: boolean;
    response: StoredAgentResponse;
    candidateResults: CandidateResultReference[];
}

export interface StoredRunInteraction extends RunInteraction {
    modelCondition: string;
    repetition: number;
}

export interface ExperimentRunSummary {
    modelCondition: string;
    repetition: number;
    startedAt: string;
    completedAt: string;
    interactions: RunInteraction[];
}
