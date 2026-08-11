import path from 'node:path';
import sqlite3 from 'sqlite3';

import type { SaveInteractionInput } from '../types';

export class TranscriptRepository {
    private readonly db: sqlite3.Database;
    private readonly databasePath: string;
    private readonly initialized: Promise<void>;

    constructor(databasePath = path.resolve(__dirname, 'transcripts.db')) {
        this.databasePath = databasePath;
        this.db = new sqlite3.Database(databasePath);
        this.initialized = this.initialize();
    }

    public async saveInteraction(input: SaveInteractionInput): Promise<number> {
        await this.initialized;
        await this.run('BEGIN IMMEDIATE TRANSACTION');

        try {
            await this.run(
                `INSERT INTO sessions (
                    session_id, created_at, experiment_name,
                    experiment_condition, prompt_version, agent_id,
                    agent_alias, region, model
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    experiment_name = COALESCE(excluded.experiment_name, experiment_name),
                    experiment_condition = COALESCE(excluded.experiment_condition, experiment_condition),
                    prompt_version = COALESCE(excluded.prompt_version, prompt_version),
                    agent_id = COALESCE(excluded.agent_id, agent_id),
                    agent_alias = COALESCE(excluded.agent_alias, agent_alias),
                    region = COALESCE(excluded.region, region),
                    model = COALESCE(excluded.model, model)`,
                [
                    input.sessionId,
                    input.startedAt.toISOString(),
                    input.experimentName ?? null,
                    input.experimentCondition ?? null,
                    input.promptVersion ?? null,
                    input.agentId ?? null,
                    input.agentAlias ?? null,
                    input.region ?? null,
                    input.foundationModel ?? null
                ]
            );

            const result = await this.run(
                `INSERT INTO interactions (
                    session_id, question, answer, started_at, elapsed_ms,
                    status, error, foundation_model, input_tokens,
                    output_tokens, total_tokens, total_steps,
                    model_invocations, action_invocations, retry_count,
                    first_attempt_succeeded, sql_attempts, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    input.sessionId,
                    input.question,
                    input.answer,
                    input.startedAt.toISOString(),
                    Math.round(input.elapsedMs),
                    input.status,
                    input.error ?? null,
                    input.foundationModel ?? null,
                    input.tokenUsage?.inputTokens ?? null,
                    input.tokenUsage?.outputTokens ?? null,
                    input.tokenUsage?.totalTokens ?? null,
                    input.agentMetrics?.totalSteps ?? null,
                    input.agentMetrics?.modelInvocations ?? null,
                    input.agentMetrics?.actionInvocations ?? null,
                    input.agentMetrics?.retryCount ?? null,
                    this.toSqliteBoolean(
                        input.agentMetrics?.firstAttemptSucceeded
                    ),
                    input.sqlAttempts
                        ? JSON.stringify(input.sqlAttempts)
                        : null,
                    new Date().toISOString()
                ]
            );

            for (const traceEvent of input.traceEvents ?? []) {
                await this.run(
                    `INSERT INTO trace_events (
                        interaction_id, session_id, sequence_number, trace_id,
                        event_time, stage, event_type, agent_id, agent_alias_id,
                        agent_version, foundation_model, rationale,
                        action_group, action_name, action_input, observation,
                        input_tokens, output_tokens, model_latency_ms,
                        action_latency_ms, sanitized_event, raw_event,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        result.lastID,
                        input.sessionId,
                        traceEvent.sequenceNumber,
                        traceEvent.traceId,
                        traceEvent.eventTime?.toISOString() ?? null,
                        traceEvent.stage,
                        traceEvent.eventType,
                        traceEvent.agentId,
                        traceEvent.agentAliasId,
                        traceEvent.agentVersion,
                        traceEvent.foundationModel,
                        traceEvent.rationale,
                        traceEvent.actionGroup,
                        traceEvent.actionName,
                        this.serializeJson(traceEvent.actionInput),
                        this.serializeJson(traceEvent.observation),
                        traceEvent.inputTokens,
                        traceEvent.outputTokens,
                        traceEvent.modelLatencyMs,
                        traceEvent.actionLatencyMs,
                        this.serializeJson(traceEvent.sanitizedEvent),
                        this.serializeJson(traceEvent.rawEvent),
                        new Date().toISOString()
                    ]
                );
            }

            await this.run('COMMIT');
            console.info('Transcript interaction saved', {
                interactionId: result.lastID,
                sessionId: input.sessionId,
                status: input.status,
                traceEvents: input.traceEvents?.length ?? 0
            });
            return result.lastID;
        } catch (error) {
            await this.run('ROLLBACK').catch(() => undefined);
            console.error('Failed to save transcript interaction', {
                sessionId: input.sessionId,
                status: input.status,
                error
            });
            throw error;
        }
    }

    public async close(): Promise<void> {
        await this.initialized;
        await new Promise<void>((resolve, reject) => {
            this.db.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
        console.info('Transcript database closed', {
            databasePath: this.databasePath
        });
    }

    private async initialize(): Promise<void> {
        try {
            await this.exec(`
                PRAGMA foreign_keys = ON;
                PRAGMA busy_timeout = 5000;
                PRAGMA journal_mode = WAL;

                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    experiment_name TEXT,
                    experiment_condition TEXT,
                    prompt_version TEXT,
                    agent_id TEXT,
                    agent_alias TEXT,
                    region TEXT,
                    model TEXT
                );

                CREATE TABLE IF NOT EXISTS interactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    elapsed_ms INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    error TEXT,
                    foundation_model TEXT,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    total_tokens INTEGER,
                    total_steps INTEGER,
                    model_invocations INTEGER,
                    action_invocations INTEGER,
                    retry_count INTEGER,
                    first_attempt_succeeded INTEGER,
                    sql_attempts TEXT,
                    evaluation_status TEXT DEFAULT 'pending',
                    evaluation_score REAL,
                    evaluation_notes TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
                );

                CREATE TABLE IF NOT EXISTS trace_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    interaction_id INTEGER NOT NULL,
                    session_id TEXT NOT NULL,
                    sequence_number INTEGER NOT NULL,
                    trace_id TEXT,
                    event_time TEXT,
                    stage TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    agent_id TEXT,
                    agent_alias_id TEXT,
                    agent_version TEXT,
                    foundation_model TEXT,
                    rationale TEXT,
                    action_group TEXT,
                    action_name TEXT,
                    action_input TEXT,
                    observation TEXT,
                    input_tokens INTEGER,
                    output_tokens INTEGER,
                    model_latency_ms INTEGER,
                    action_latency_ms INTEGER,
                    sanitized_event TEXT NOT NULL,
                    raw_event TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (interaction_id) REFERENCES interactions(id)
                        ON DELETE CASCADE,
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
                        ON DELETE CASCADE,
                    UNIQUE (interaction_id, sequence_number)
                );

                CREATE INDEX IF NOT EXISTS idx_interactions_session_id
                    ON interactions(session_id);
                CREATE INDEX IF NOT EXISTS idx_interactions_started_at
                    ON interactions(started_at);
                CREATE INDEX IF NOT EXISTS idx_trace_events_interaction_id
                    ON trace_events(interaction_id);
                CREATE INDEX IF NOT EXISTS idx_trace_events_trace_id
                    ON trace_events(trace_id);
                CREATE INDEX IF NOT EXISTS idx_trace_events_stage_type
                    ON trace_events(stage, event_type);
            `);
            await this.exec(`
                CREATE INDEX IF NOT EXISTS idx_trace_events_session_id
                    ON trace_events(session_id);
            `);
            console.info('Transcript database ready', {
                databasePath: this.databasePath
            });
        } catch (error) {
            console.error('Failed to initialize transcript database', {
                databasePath: this.databasePath,
                error
            });
            throw error;
        }
    }

    private exec(sql: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db.exec(sql, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }

    private run(
        sql: string,
        parameters: unknown[] = []
    ): Promise<{ lastID: number; changes: number }> {
        return new Promise((resolve, reject) => {
            this.db.run(sql, parameters, function (error) {
                if (error) {
                    reject(error);
                    return;
                }
                resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    }

    private toSqliteBoolean(value: boolean | null | undefined): number | null {
        return value === undefined || value === null ? null : Number(value);
    }

    private serializeJson(value: unknown | null): string | null {
        return value === null || value === undefined
            ? null
            : JSON.stringify(value);
    }
}
