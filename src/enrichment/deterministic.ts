/**
 * Deterministic enrichment: free, private, always-on. No model calls.
 * Produces a factual summary from files/commands/prompts and heuristic decisions.
 */
import type { EnrichmentProvider } from "./types.ts";
import type { SessionForSummary, SessionSummary } from "../core/types.ts";

export class DeterministicProvider implements EnrichmentProvider {
  readonly id = "deterministic";

  async summarize(input: SessionForSummary): Promise<SessionSummary> {
    const firstUser = input.prompts.find((p) => p.actor === "user")?.text ?? "";
    const goal = extractGoal(firstUser);
    const cmds = dedupe(input.commands).slice(0, 10);

    const title = clipTitle(input.title?.trim() || goal) || undefined;
    // Body carries the human goal; files are rendered separately by the digest,
    // and the title already surfaces the ask, so don't repeat it here.
    const summary = [
      goal || undefined,
      cmds.length ? `Commands: ${cmds.join(" | ")}` : undefined,
    ]
      .filter(Boolean)
      .join("\n");

    return { summary, title, decisions: [] };
  }
}

/**
 * Cursor prompts are wrapped in system-injected blocks (<timestamp>,
 * <manually_attached_skills>, <attached_files>, ...). The real ask is usually
 * inside <user_query>. Recover the human goal, falling back to the first line
 * that isn't a wrapper tag.
 */
function extractGoal(raw: string): string {
  const uq = raw.match(/<user_query>([\s\S]*?)<\/user_query>/i);
  const text = (uq?.[1] ?? stripWrappers(raw)).trim();
  const line = text.split("\n").map((l) => l.trim()).find((l) => l && !/^<[^>]+>/.test(l)) ?? "";
  return line.slice(0, 200);
}

/** Truncate a title to `max` chars on a word boundary, adding an ellipsis. */
function clipTitle(s: string, max = 80): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function stripWrappers(raw: string): string {
  return raw
    .replace(/<(timestamp|manually_attached_skills|attached_files|system_reminder|additional_data|user_info)[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, " ");
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
