/**
 * Adapter registry: resolves enabled adapters by id. Add new tools here.
 */
import type { Config } from "../core/config.ts";
import type { SourceAdapter } from "./types.ts";
import { CursorAdapter } from "./cursor.ts";
import { ClaudeAdapter } from "./claude.ts";

export function buildAdapters(cfg: Config): Map<string, SourceAdapter> {
  const list: SourceAdapter[] = [new CursorAdapter(cfg), new ClaudeAdapter(cfg)];
  return new Map(list.map((a) => [a.id, a]));
}

export function getAdapter(cfg: Config, id: string): SourceAdapter | undefined {
  return buildAdapters(cfg).get(id);
}
