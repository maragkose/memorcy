/**
 * Resolve the enrichment provider from config. Deterministic is always available
 * as a baseline; LLM providers layer on top when configured.
 */
import type { Config } from "../core/config.ts";
import type { EnrichmentProvider } from "./types.ts";
import { DeterministicProvider } from "./deterministic.ts";
import { OllamaProvider } from "./llm.ts";

export function buildEnrichment(cfg: Config): EnrichmentProvider {
  switch (cfg.enrich) {
    case "ollama":
      return new OllamaProvider(cfg);
    case "openai":
    case "gemini":
      // TODO: OpenAI/Gemini providers (same interface, different HTTP shape).
      return new DeterministicProvider();
    case "deterministic":
    default:
      return new DeterministicProvider();
  }
}
