/**
 * Cursor adapter — primary source.
 *
 * Confirmed on-disk layout:
 *   ~/.cursor/projects/<project>/agent-transcripts/<uuid>/<uuid>.jsonl   (primary)
 *   ~/.cursor/chats/<hash>/<uuid>/{store.db,meta.json,prompt_history.json} (deep, ~1.1GB)
 *   ~/.config/Cursor/User/**\/state.vscdb                                 (titles, best effort)
 *   ~/.cursor/projects/<project>/repo.json                               (project->repo)
 *
 * This skeleton implements transcript discovery + a JSONL line parser. The deep
 * `chats` backfill and state.vscdb enrichment are phase-5 TODOs.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type { Config } from "../core/config.ts";
import type { RawEvent, SessionRef, Actor, EventRef } from "../core/types.ts";
import type { Disposable, SourceAdapter } from "./types.ts";
import { log } from "../core/log.ts";

interface TranscriptLine {
  role?: string;
  message?: { content?: Array<{ type?: string; text?: string }> };
  // tool events may carry other shapes; kept in `raw`.
  [k: string]: unknown;
}

export class CursorAdapter implements SourceAdapter {
  readonly id = "cursor";
  private readonly projectsDir: string;

  constructor(private readonly cfg: Config) {
    this.projectsDir = path.join(cfg.sources.cursorHome, "projects");
  }

  async *discover(): AsyncIterable<SessionRef> {
    let projects: string[] = [];
    try {
      projects = await fsp.readdir(this.projectsDir);
    } catch {
      log.warn(`no cursor projects dir at ${this.projectsDir}`);
      return;
    }
    for (const project of projects) {
      const tdir = path.join(this.projectsDir, project, "agent-transcripts");
      let sessionDirs: string[] = [];
      try {
        sessionDirs = await fsp.readdir(tdir);
      } catch {
        continue;
      }
      for (const sid of sessionDirs) {
        const file = path.join(tdir, sid, `${sid}.jsonl`);
        if (!fs.existsSync(file)) continue;
        const stat = await fsp.stat(file);
        yield {
          tool: this.id,
          project,
          sessionId: sid,
          sourcePath: file,
          startedAt: stat.birthtime.toISOString(),
          mtime: stat.mtime.toISOString(),
        };
      }
    }
  }

  async *read(session: SessionRef): AsyncIterable<RawEvent> {
    const stream = fs.createReadStream(session.sourcePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let seq = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;
      let obj: TranscriptLine;
      try {
        obj = JSON.parse(line);
      } catch {
        continue; // skip malformed lines
      }
      const text = extractText(obj);
      const actor = normalizeActor(obj.role);
      yield {
        tool: this.id,
        project: session.project,
        sessionId: session.sessionId,
        ts: session.startedAt ?? new Date().toISOString(),
        actor,
        kind: actor === "assistant" ? "response" : "prompt",
        text,
        refs: extractRefs(text),
        raw: obj,
      };
      seq++;
    }
    log.debug(`read ${seq} events from ${session.sessionId}`);
  }

  /** Live capture: watch the transcripts tree and emit on file change. */
  watch(onEvent: (e: RawEvent) => void): Disposable {
    // TODO(phase 2): debounce fs.watch on this.projectsDir, tail changed .jsonl,
    // and emit only new lines. For now a no-op placeholder wired to the interface.
    log.info("cursor.watch(): live capture not yet implemented (phase 2)");
    void onEvent;
    return { dispose() {} };
  }
}

function normalizeActor(role?: string): Actor {
  switch (role) {
    case "assistant":
      return "assistant";
    case "system":
      return "system";
    case "tool":
      return "tool";
    default:
      return "user";
  }
}

function extractText(obj: TranscriptLine): string {
  const parts = obj.message?.content ?? [];
  const text = parts
    .filter((p) => p?.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n")
    .trim();
  // Strip Cursor's <user_query> wrapper tags.
  return text.replace(/<\/?user_query>/g, "").trim();
}

/** Cheap deterministic ref extraction (paths). Real extraction improves in phase 1. */
function extractRefs(text?: string): EventRef[] {
  if (!text) return [];
  const refs: EventRef[] = [];
  const fileRe = /(?:^|\s)([\w./-]+\.(?:ts|tsx|js|cpp|h|hpp|py|md|json|robot|sh))\b/g;
  for (const m of text.matchAll(fileRe)) {
    if (m[1]) refs.push({ kind: "file", value: m[1] });
  }
  return refs;
}
