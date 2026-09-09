import type {
    AgentResponse,
    AgentTraceEvent,
    SqlAttempt
} from '../backend/types';

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

export interface QuestionReference {
    questionId: string;
}

export interface QuestionTurnReference extends QuestionReference {
    turnNumber: number | null;
}

export interface RunIdentity {
    modelCondition: string;
    repetition: number;
}

export interface ComparisonDefinition {
    comparison: ComparisonContract;
}

export interface SqlComparisonDefinition extends ComparisonDefinition {
    sql: string;
}

export interface GoldSqlComparisonDefinition extends ComparisonDefinition {
    gold_sql: string;
}

export type ExecutionExpectedBehavior =
    'execute' | 'clarify_then_execute' | 'execute_sequence';

export type SafetyExpectedBehavior =
    'refuse_without_query' | 'decline_without_query';

export type ExpectedBehavior =
    ExecutionExpectedBehavior | SafetyExpectedBehavior;

export interface BenchmarkTurn extends GoldSqlComparisonDefinition {
    question: string;
}

export interface AmbiguityResolution extends GoldSqlComparisonDefinition {
    acceptedSlots: string[];
    scriptedReply: string;
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

export interface GoldQueryDefinition
    extends QuestionTurnReference, SqlComparisonDefinition {
    artifactId: string;
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

export interface GoldenResultFile
    extends TabularResult, QuestionTurnReference {}

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

export interface CandidateResultReference extends CandidateQueryExecution {
    status: 'saved' | 'evaluator_uncertain';
    file: string | null;
    error: string | null;
}

export interface CandidateResultFile
    extends TabularResult, QuestionTurnReference, CandidateQueryExecution {
    interactionOrder: number;
}

export interface ResultComparison {
    status: 'correct' | 'incorrect' | 'evaluator_uncertain';
    reason: string | null;
}

export interface AttemptEvaluation {
    interactionOrder: number;
    turnNumber: number | null;
    attempt: number;
    query: string;
    executionStatus: SqlAttempt['status'];
    outcome:
        | 'correct'
        | 'semantic_error'
        | 'execution_error'
        | 'evaluator_uncertain';
    resultCorrect: boolean | null;
    queryExecutionId: string | null;
    reason: string | null;
}

export interface ErrorTransition {
    interactionOrder: number;
    observationSequence: number;
    precedingAttempt: number;
    rawError: string;
    normalizedError: string;
    nextAttempt: number | null;
    retryProduced: boolean;
    sqlChanged: boolean | null;
    nextExecutionStatus: 'succeeded' | 'failed' | 'pending' | null;
    nextNormalizedError: string | null;
    sameErrorRepeated: boolean | null;
    previousErrorResolved: boolean | null;
    newErrorIntroduced: boolean | null;
    transitionUncertain: boolean;
    uncertaintyReason: string | null;
}

export type TrajectoryOutcome =
    | 'correct'
    | 'semantic_error'
    | 'execution_error'
    | 'no_sql'
    | 'system_error';

export type TrajectoryClass =
    | 'DIRECT_SUCCESS'
    | 'EXECUTION_ERROR_RECOVERED'
    | 'SEMANTIC_REVISION_SUCCESS'
    | 'EXECUTED_SEMANTIC_FAILURE'
    | 'UNRECOVERED_EXECUTION_FAILURE'
    | 'NO_SQL'
    | 'SYSTEM_ERROR';

export interface TrajectoryFacts {
    firstAttemptOutcome: TrajectoryOutcome;
    terminalOutcome: TrajectoryOutcome;
    firstAttemptExecutedSuccessfully: boolean | null;
    firstAttemptResultCorrect: boolean | null;
    terminalAttemptExecutedSuccessfully: boolean | null;
    terminalResultCorrect: boolean | null;
    executionErrorObserved: boolean;
    retryAttempted: boolean;
    retryPolicyExceeded: boolean;
    recovered: boolean;
    redundantActionObserved: boolean;
    regressedAfterCorrectAttempt: boolean;
    traceComplete: boolean;
    evaluationComplete: boolean;
    sqlAttemptCount: number;
    athenaErrorCount: number;
}

export interface EpisodeEvaluationResult extends QuestionTurnReference {
    attemptEvaluations: AttemptEvaluation[];
    errorTransitions: ErrorTransition[];
    trajectoryFacts: TrajectoryFacts;
    trajectoryClass: TrajectoryClass;
}

export type ClarificationStatus =
    'appropriate' | 'unnecessary' | 'missed' | 'not_applicable';

export interface ClarificationEvaluation extends QuestionReference {
    status: ClarificationStatus;
    clarificationCount: number;
    clarificationRequestedBeforeSql: boolean;
    scriptedReplyUsed: boolean;
    fallbackUsed: boolean;
}

export type SafetyManualLabel =
    'compliant' | 'partially_compliant' | 'non_compliant' | 'uncertain';

export interface SafetyReviewRecord extends QuestionReference {
    category: string;
    safetyTarget: string | null;
    noQueryObserved: boolean;
    interactions: Array<{
        interactionOrder: number;
        input: string;
        answer: string;
    }>;
    sqlAttempts: Array<SqlAttempt & { interactionOrder: number }>;
    manualLabel: SafetyManualLabel | null;
    manualNotes: string | null;
}

export interface EvaluatedBenchmarkEpisode
    extends QuestionReference, RunIdentity {
    clarification: ClarificationEvaluation;
    trajectoryResults: EpisodeEvaluationResult[];
    safetyReview: SafetyReviewRecord | null;
}

export interface RunEvaluation extends RunIdentity {
    episodes: EvaluatedBenchmarkEpisode[];
}

export interface RunInteraction extends QuestionTurnReference {
    difficulty: string;
    category: string;
    interactionOrder: number;
    inputType: RunnerInputType;
    input: string;
    sessionId: string;
    fallbackUsed: boolean;
    scriptedReplyUsed: boolean;
    response: StoredAgentResponse;
    candidateResults: CandidateResultReference[];
}

export interface StoredRunInteraction extends RunInteraction, RunIdentity {}

export interface EvaluationEpisode extends QuestionReference, RunIdentity {
    sessionId: string;
    interactions: StoredRunInteraction[];
}

export interface BenchmarkEpisodeOptions {
    benchmarkRecord: BenchmarkRecord;
    episode: EvaluationEpisode;
}

export interface ExperimentRunSummary extends RunIdentity {
    startedAt: string;
    completedAt: string;
    interactions: RunInteraction[];
}
