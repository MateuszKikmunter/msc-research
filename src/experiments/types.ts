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
    expected_behavior: string;
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
