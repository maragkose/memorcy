/**
 * Retrieval queries: the read surface used by the MCP server and CLI.
 * Hybrid GraphRAG = full-text (BM25) + optional vector, then graph expansion.
 */
import type { Surreal } from "surrealdb";
import type { SearchHit } from "./types.ts";

export interface DigestSession {
  project?: string;
  title?: string;
  summary?: string;
  started_at?: string;
  files?: string[];
}

/** Most recent enriched sessions, for the rules-file digest / cold-start briefing. */
export async function recentSessions(db: Surreal, limit = 12): Promise<DigestSession[]> {
  const [rows] = await db.query<[DigestSession[]]>(
    `SELECT
        project,
        title,
        summary,
        started_at,
        ->touched->file.path AS files
     FROM session
     WHERE status = 'ready'
     ORDER BY started_at DESC
     LIMIT $limit;`,
    { limit },
  );
  return rows ?? [];
}

export interface SearchOpts {
  project?: string;
  kind?: string; // table name filter
  limit?: number;
}

type Row = { id: string; type: string; title: string; ts?: string; project?: string; score: number };

/** Tokenize a query into distinct significant terms (cap keeps match refs sane). */
function terms(query: string, max = 6): string[] {
  const seen = new Set<string>();
  for (const t of query.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (t.length > 1) seen.add(t);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * Full-text search. SurrealDB FT requires the matched field to be indexed on its
 * own table, so we query each table separately (session.summary, prompt.text)
 * and merge by BM25 score. Terms are OR-matched with summed relevance for recall.
 * Vector rerank is added in phase 4.
 */
export async function search(db: Surreal, query: string, opts: SearchOpts = {}): Promise<SearchHit[]> {
  const limit = opts.limit ?? 20;
  const project = opts.project ?? undefined;
  const ts = terms(query);
  if (ts.length === 0) return [];

  const params: Record<string, unknown> = { limit, project };
  ts.forEach((t, i) => (params[`t${i}`] = t));
  const where = (field: string) => ts.map((_, i) => `${field} @${i}@ $t${i}`).join(" OR ");
  const score = ts.map((_, i) => `search::score(${i})`).join(" + ");

  const [sessions] = await db.query<[Row[]]>(
    `SELECT meta::id(id) AS id, 'session' AS type,
            (summary ?? title ?? external_id) AS title,
            started_at AS ts, project, (${score}) AS score
     FROM session
     WHERE (${where("summary")}) AND ($project = NONE OR project = $project)
     ORDER BY score DESC LIMIT $limit;`,
    params,
  );

  const [prompts] = await db.query<[Row[]]>(
    `SELECT meta::id(id) AS id, 'prompt' AS type,
            text AS title, ts,
            (<-contains<-session.project)[0] AS project,
            (${score}) AS score
     FROM prompt
     WHERE ${where("text")}
     ORDER BY score DESC LIMIT $limit;`,
    params,
  );

  // Notes/documents: match content (refs 0..n-1) and title (refs n..2n-1),
  // summing both for a combined BM25 score.
  const nn = ts.length;
  const whereDoc =
    ts.map((_, i) => `content @${i}@ $t${i}`).join(" OR ") +
    " OR " +
    ts.map((_, i) => `title @${nn + i}@ $t${i}`).join(" OR ");
  const scoreDoc =
    ts.map((_, i) => `search::score(${i})`).join(" + ") +
    " + " +
    ts.map((_, i) => `search::score(${nn + i})`).join(" + ");
  const [documents] = await db.query<[Row[]]>(
    `SELECT meta::id(id) AS id, 'document' AS type,
            (title ?? path) AS title, source_mtime AS ts, project,
            (${scoreDoc}) AS score
     FROM document
     WHERE (${whereDoc}) AND ($project = NONE OR project = $project)
     ORDER BY score DESC LIMIT $limit;`,
    params,
  );

  return [...(sessions ?? []), ...(prompts ?? []), ...(documents ?? [])]
    .filter((r) => (project ? r.project === project : true))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

export async function getNode(db: Surreal, id: string): Promise<unknown> {
  const [rows] = await db.query(`SELECT * FROM $id;`, { id });
  return (rows as unknown[])?.[0] ?? null;
}

/**
 * Multi-hop traversal: from a node id along an edge to a given depth.
 * e.g. graphQuery(db, 'file:xyz', '<-touched<-session', 1)
 */
export async function graphQuery(
  db: Surreal,
  fromId: string,
  edgePath: string,
): Promise<unknown[]> {
  const [rows] = await db.query(`SELECT ${edgePath} AS related FROM $id;`, { id: fromId });
  return (rows as unknown[]) ?? [];
}

/**
 * Cold-start briefing for a project: most recent sessions, their files, and open
 * decisions. This is what an agent calls at the start of a chat.
 */
export async function resume(db: Surreal, project: string, limit = 5): Promise<unknown> {
  const [rows] = await db.query(
    `SELECT
        title,
        summary,
        started_at,
        ->touched->file.path AS files,
        ->contains->prompt.text AS recent_prompts
     FROM session
     WHERE project = $project AND status = 'ready'
     ORDER BY started_at DESC
     LIMIT $limit;`,
    { project, limit },
  );
  return rows ?? [];
}
