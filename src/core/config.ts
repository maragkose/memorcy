/**
 * Centralized configuration, resolved from environment with sensible local defaults.
 */
import os from "node:os";
import path from "node:path";

function env(key: string, fallback = ""): string {
  const v = process.env[key];
  return v === undefined || v === "" ? fallback : v;
}

const home = os.homedir();

export type EnrichMode = "deterministic" | "ollama" | "openai" | "gemini";
export type EmbedMode = "none" | "ollama" | "openai" | "transformers";

export interface Config {
  db: {
    url: string;
    user: string;
    pass: string;
    namespace: string;
    database: string;
  };
  enrich: EnrichMode;
  embed: EmbedMode;
  ollama: { url: string; model: string; embedModel: string };
  sources: {
    cursorHome: string; // ~/.cursor
    cursorConfig: string; // ~/.config/Cursor
    claudeHome: string; // ~/.claude
    homeDir: string;
  };
  /** Rules-file injection: no-MCP fallback that any session reads automatically. */
  mdc: {
    enabled: boolean;
    path: string; // target .mdc (always-applied)
    limit: number; // max sessions in the digest
    intervalMs: number; // daemon re-export cadence
  };
  /** Daemon-driven incremental ingest: keeps memory fresh with no manual backfill. */
  ingest: {
    watch: boolean; // poll sources for new/changed sessions
    intervalMs: number; // poll cadence
  };
  dataDir: string;
}

export function loadConfig(): Config {
  return {
    db: {
      url: env("MEM_DB_URL", "ws://127.0.0.1:8000/rpc"),
      user: env("MEM_DB_USER", "root"),
      pass: env("MEM_DB_PASS", "root"),
      namespace: env("MEM_DB_NS", "memento"),
      database: env("MEM_DB_DB", "memory"),
    },
    enrich: env("MEM_ENRICH", "deterministic") as EnrichMode,
    embed: env("MEM_EMBED", "none") as EmbedMode,
    ollama: {
      url: env("MEM_OLLAMA_URL", "http://127.0.0.1:11434"),
      model: env("MEM_OLLAMA_MODEL", "llama3.1"),
      embedModel: env("MEM_OLLAMA_EMBED_MODEL", "nomic-embed-text"),
    },
    sources: {
      cursorHome: env("MEM_CURSOR_HOME", path.join(home, ".cursor")),
      cursorConfig: path.join(home, ".config", "Cursor"),
      claudeHome: path.join(home, ".claude"),
      homeDir: home,
    },
    mdc: {
      enabled: env("MEM_MDC", "true") !== "false",
      path: env("MEM_MDC_PATH", path.join(home, ".cursor", "rules", "memento.mdc")),
      limit: Number(env("MEM_MDC_LIMIT", "12")),
      intervalMs: Number(env("MEM_MDC_INTERVAL_MS", "300000")), // 5 min
    },
    ingest: {
      watch: env("MEM_INGEST_WATCH", "true") !== "false",
      intervalMs: Number(env("MEM_INGEST_INTERVAL_MS", "60000")), // 1 min
    },
    dataDir: path.join(home, ".local", "share", "memento"),
  };
}
