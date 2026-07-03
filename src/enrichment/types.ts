/**
 * EnrichmentProvider seam: keeps the core independent of any specific model or API.
 * Swap deterministic <-> Ollama <-> API without touching ingestion/serving.
 */
import type { SessionForSummary, SessionSummary } from "../core/types.ts";

export interface EnrichmentProvider {
  readonly id: string;
  /** Return embeddings for the given texts (same order). Optional. */
  embed?(texts: string[]): Promise<number[][]>;
  /** Summarize a session and extract decisions. Optional. */
  summarize?(input: SessionForSummary): Promise<SessionSummary>;
}
