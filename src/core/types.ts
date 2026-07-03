/**
 * Common domain types shared across adapters, ingestion, enrichment, and serving.
 *
 * The `RawEvent` is the normalization boundary: every SourceAdapter emits a stream
 * of RawEvents, and the normalizer turns those into graph node/edge mutations.
 */

export type Actor = "user" | "assistant" | "system" | "tool";

export type EventKind =
  | "prompt"
  | "response"
  | "edit"
  | "command"
  | "tool_call"
  | "meta";

export type RefKind = "file" | "command" | "repo" | "tool" | "project";

export interface EventRef {
  kind: RefKind;
  value: string; // e.g. file path, command text, repo remote
  meta?: Record<string, unknown>;
}

/** The single normalized unit produced by every adapter. */
export interface RawEvent {
  tool: string; // 'cursor' | 'claude' | ...
  project: string; // project slug/name
  sessionId: string; // adapter-stable session id
  ts: string; // ISO timestamp
  actor: Actor;
  kind: EventKind;
  text?: string;
  refs?: EventRef[];
  raw?: unknown; // original payload, kept for reprocessing
}

/** A discovered session before its events are read. */
export interface SessionRef {
  tool: string;
  project: string;
  sessionId: string;
  sourcePath: string;
  startedAt?: string;
  title?: string;
  mtime?: string; // source file last-modified (ISO); drives incremental sync
}

export type SessionStatus = "raw" | "enriching" | "ready" | "error";

export interface SessionSummary {
  summary: string;
  title?: string;
  decisions: Array<{
    text: string;
    kind: string;
    confidence: number;
  }>;
}

export interface SessionForSummary {
  sessionId: string;
  title?: string;
  prompts: Array<{ actor: Actor; text: string }>;
  files: string[];
  commands: string[];
}

/** Compact search hit returned to callers/MCP (token-efficient). */
export interface SearchHit {
  id: string;
  type: string; // table name: session | prompt | decision | ...
  title: string;
  ts?: string;
  project?: string;
  score: number;
}
