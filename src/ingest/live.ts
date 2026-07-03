/**
 * Live coordination via SurrealDB LIVE queries — the DB is the job bus.
 *
 * Flow:
 *   1. ingestion writes session (status='raw')
 *   2. this subscriber gets a LIVE notification
 *   3. it enriches (summary + embedding) and sets status='ready'
 *
 * No external broker. If durability/retry becomes critical, replace the LIVE
 * subscription with NATS/Redis behind this same consumer function.
 */
import { Table } from "surrealdb";
import type { Surreal } from "surrealdb";
import type { Config } from "../core/config.ts";
import type { EnrichmentProvider } from "../enrichment/types.ts";
import type { SessionForSummary } from "../core/types.ts";
import { sessionRid, setSessionStatus } from "../core/graph.ts";
import { enrichSession } from "../enrichment/run.ts";
import { log } from "../core/log.ts";

export async function startEnrichmentSubscriber(
  db: Surreal,
  _cfg: Config,
  provider: EnrichmentProvider,
): Promise<() => Promise<void>> {
  // v2 SDK: db.live() resolves to a LiveSubscription; subscribe() takes a
  // single LiveMessage { action, recordId, value }.
  const sub = await db.live(new Table("session"));
  const unsubscribe = sub.subscribe((msg) => {
    if (msg.action !== "CREATE" && msg.action !== "UPDATE") return;
    const row = msg.value as { tool?: string; external_id?: string; status?: string };
    if (row.status !== "raw" || !row.tool || !row.external_id) return;
    // Rebuild the canonical rid from stable fields (matches backfill's format).
    const rid = sessionRid(row.tool, row.external_id);
    void enrichOne(db, provider, rid);
  });

  log.info(`enrichment subscriber running (provider=${provider.id})`);
  return async () => {
    unsubscribe();
    await sub.kill();
  };
}

async function enrichOne(db: Surreal, provider: EnrichmentProvider, rid: string): Promise<void> {
  try {
    await setSessionStatus(db, rid, "enriching");
    const input = await loadSessionForSummary(db, rid);
    await enrichSession(db, provider, rid, input);
    log.debug(`enriched ${rid}`);
  } catch (err) {
    log.error(`enrichment failed for ${rid}`, err);
    await setSessionStatus(db, rid, "error").catch(() => {});
  }
}

async function loadSessionForSummary(db: Surreal, rid: string): Promise<SessionForSummary> {
  const [rows] = await db.query<[
    Array<{
      external_id: string;
      title?: string;
      prompts?: Array<{ role: string; text: string }>;
      files?: string[];
      commands?: string[];
    }>,
  ]>(
    `SELECT
        external_id,
        title,
        ->contains->prompt.{role, text} AS prompts,
        ->touched->file.path AS files,
        ->ran->command.text AS commands
     FROM $id;`,
    { id: rid },
  );
  const r = rows?.[0];
  return {
    sessionId: r?.external_id ?? rid,
    title: r?.title,
    prompts: (r?.prompts ?? []).map((p) => ({
      actor: (p.role as SessionForSummary["prompts"][number]["actor"]) ?? "user",
      text: p.text ?? "",
    })),
    files: r?.files ?? [],
    commands: r?.commands ?? [],
  };
}
