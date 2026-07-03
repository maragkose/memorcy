/**
 * Notes/document ingestion. Mirrors session backfill: idempotent upserts keyed by
 * path, incremental by mtime. Content is stored for BM25 full-text search; it is
 * NOT added to the always-apply digest (notes surface via search / the web UI).
 */
import type { Surreal } from "surrealdb";
import type { Config } from "../core/config.ts";
import type { DocRef } from "../core/types.ts";
import { NotesSource, titleFrom } from "../adapters/notes.ts";
import { upsertDocument, existingDocumentMtimes } from "../core/graph.ts";
import { log } from "../core/log.ts";

export interface NotesStats {
  scanned: number;
  updated: number;
}

/** Read + upsert a single document (idempotent). */
export async function writeDocument(db: Surreal, source: NotesSource, ref: DocRef): Promise<void> {
  const content = await source.read(ref);
  await upsertDocument(db, {
    path: ref.path,
    title: titleFrom(ref, content),
    content,
    project: ref.project,
    ext: ref.ext,
    bytes: ref.bytes,
    mtime: ref.mtime,
  });
}

/**
 * Index new/changed notes across configured roots. Cheap enough for the daemon's
 * poll loop; the first run indexes everything, later runs only touch changed files.
 */
export async function syncDocuments(db: Surreal, cfg: Config, source?: NotesSource): Promise<NotesStats> {
  const stats: NotesStats = { scanned: 0, updated: 0 };
  if (!cfg.notes.enabled) return stats;
  const src = source ?? new NotesSource(cfg);
  const seen = await existingDocumentMtimes(db);
  for await (const ref of src.discover()) {
    stats.scanned++;
    const prev = seen.get(ref.path);
    const changed = prev === undefined || !prev || new Date(ref.mtime) > new Date(prev);
    if (!changed) continue;
    await writeDocument(db, src, ref);
    stats.updated++;
    if (stats.updated % 100 === 0) log.info(`notes: indexed ${stats.updated}...`);
  }
  if (stats.updated > 0) log.info(`notes sync: ${stats.updated}/${stats.scanned} documents updated`);
  return stats;
}
