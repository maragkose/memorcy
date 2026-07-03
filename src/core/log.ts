/**
 * Minimal structured logger. Writes to stderr so it never corrupts MCP stdio
 * (the MCP protocol uses stdout for JSON-RPC).
 */
type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold = order[(process.env.MEM_LOG_LEVEL as Level) ?? "info"] ?? 1;

function emit(level: Level, msg: string, extra?: unknown): void {
  if (order[level] < threshold) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${msg}`;
  if (extra !== undefined) console.error(line, extra);
  else console.error(line);
}

export const log = {
  debug: (m: string, e?: unknown) => emit("debug", m, e),
  info: (m: string, e?: unknown) => emit("info", m, e),
  warn: (m: string, e?: unknown) => emit("warn", m, e),
  error: (m: string, e?: unknown) => emit("error", m, e),
};
