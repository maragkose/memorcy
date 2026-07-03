/**
 * Ingestion: turn adapter sessions into graph nodes/edges.
 *
 * - `writeSession` is the idempotent unit of work: it clears a session's prior
 *   prompts/edges and re-reads the transcript, so running it again (or on a
 *   grown transcript) converges instead of duplicating.
 * - `backfill` processes every discovered session (one-shot / full rebuild).
 * - `syncChanged` processes only new or modified sessions (daemon-driven,
 *   compares on-disk mtime to the stored source_mtime).
 */
import type { Surreal } from "surrealdb";
import type { Config } from "../core/config.ts";
import type { SourceAdapter } from "../adapters/types.ts";
import type { EnrichmentProvider } from "../enrichment/types.ts";
import type { Actor, SessionForSummary, SessionRef } from "../core/types.ts";
import {
  upsertProject,
  upsertSession,
  addPrompt,
  touchFile,
  clearSessionContent,
  existingSessionMtimes,
  setSessionStatus,
} from "../core/graph.ts";
import { enrichSession } from "../enrichment/run.ts";
import { log } from "../core/log.ts";

export interface BackfillStats {
  sessions: number;
  events: number;
}

export interface SyncStats {
  scanned: number;
  updated: number;
  events: number;
}

/**
 * Ingest a single session idempotently. Returns the number of events read.
 * If `provider` is given the session is enriched inline and marked 'ready';
 * otherwise it is left 'raw' for the live subscriber.
 */
export async function writeSession(
  db: Surreal,
  adapter: SourceAdapter,
  session: SessionRef,
  provider?: EnrichmentProvider,
): Promise<number> {
  await upsertProject(db, session.project);
  const rid = await upsertSession(db, {
    tool: session.tool,
    sessionId: session.sessionId,
    project: session.project,
    title: session.title,
    startedAt: session.startedAt,
    mtime: session.mtime,
  });

  // Idempotent: drop prior content before re-reading the (possibly grown) file.
  await clearSessionContent(db, rid);

  const prompts: SessionForSummary["prompts"] = [];
  const files = new Set<string>();
  let events = 0;
  for await (const e of adapter.read(session)) {
    if (e.kind === "prompt" || e.kind === "response") {
      await addPrompt(db, rid, e);
      if (e.text) prompts.push({ actor: (e.actor as Actor) ?? "user", text: e.text });
    }
    for (const ref of e.refs ?? []) {
      if (ref.kind === "file") {
        await touchFile(db, rid, ref.value, e.kind);
        files.add(ref.value);
      }
    }
    events++;
  }

  if (provider) {
    await setSessionStatus(db, rid, "enriching");
    const input: SessionForSummary = {
      sessionId: session.sessionId,
      title: session.title,
      prompts,
      files: [...files],
      commands: [],
    };
    await enrichSession(db, provider, rid, input);
  } else {
    await setSessionStatus(db, rid, "raw");
  }

  return events;
}

/** Batch-ingest every session an adapter can discover (full rebuild). */
export async function backfill(
  db: Surreal,
  _cfg: Config,
  adapter: SourceAdapter,
  provider?: EnrichmentProvider,
): Promise<BackfillStats> {
  const stats: BackfillStats = { sessions: 0, events: 0 };
  for await (const session of adapter.discover()) {
    stats.events += await writeSession(db, adapter, session, provider);
    stats.sessions++;
    if (stats.sessions % 25 === 0) log.info(`backfilled ${stats.sessions} sessions...`);
  }
  log.info(`backfill done: ${stats.sessions} sessions, ${stats.events} events`);
  return stats;
}

/**
 * Ingest only sessions that are new or whose transcript changed since last seen.
 * Cheap enough to run on a short daemon interval.
 */
export async function syncChanged(
  db: Surreal,
  _cfg: Config,
  adapter: SourceAdapter,
  provider?: EnrichmentProvider,
): Promise<SyncStats> {
  const seen = await existingSessionMtimes(db);
  const stats: SyncStats = { scanned: 0, updated: 0, events: 0 };
  for await (const session of adapter.discover()) {
    stats.scanned++;
    const key = `${session.tool}::${session.sessionId}`;
    const prev = seen.get(key);
    const changed = prev === undefined || !session.mtime || !prev || new Date(session.mtime) > new Date(prev);
    if (!changed) continue;
    stats.events += await writeSession(db, adapter, session, provider);
    stats.updated++;
  }
  if (stats.updated > 0) log.info(`sync: ${stats.updated}/${stats.scanned} sessions updated (${stats.events} events)`);
  return stats;
}
