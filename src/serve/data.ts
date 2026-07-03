/**
 * Read models for the visualization UI. Kept deliberately query-light: we pull a
 * couple of base result sets and shape graph / timeline / stats in JS, which is
 * simpler and more portable than leaning on SurrealDB GROUP BY quirks.
 */
import type { Surreal } from "surrealdb";
import { search as ftSearch } from "../core/queries.ts";
import type { SearchHit } from "../core/types.ts";

export interface SessionLite {
  id: string; // meta id, e.g. "cursor::<uuid>"
  title?: string;
  project?: string;
  started_at?: string;
  status?: string;
  files: number;
}

interface TouchRow {
  s: string;
  path: string | null;
}

async function fetchSessions(db: Surreal): Promise<SessionLite[]> {
  const [rows] = await db.query<[Array<Omit<SessionLite, "files">>]>(
    `SELECT meta::id(id) AS id, title, project, started_at, status FROM session ORDER BY started_at DESC;`,
  );
  return (rows ?? []).map((r) => ({ ...r, files: 0 }));
}

async function fetchTouched(db: Surreal): Promise<TouchRow[]> {
  const [rows] = await db.query<[TouchRow[]]>(
    `SELECT meta::id(in) AS s, out.path AS path FROM touched;`,
  );
  return (rows ?? []).filter((r) => r.path);
}

export interface GraphNode {
  id: string;
  type: "session" | "file" | "project";
  label: string;
  project?: string;
  ts?: string;
  status?: string;
  val: number; // node size weight (degree-based)
}
export interface GraphLink {
  source: string;
  target: string;
  kind: "touched" | "about";
}
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Sessions + files + projects with touched/about edges. Prompts are excluded
 *  (too many); they surface in the per-session drill-down. */
export async function graphData(db: Surreal, opts: { project?: string } = {}): Promise<GraphData> {
  const [sessions, touched] = await Promise.all([fetchSessions(db), fetchTouched(db)]);
  const keep = opts.project ? sessions.filter((s) => s.project === opts.project) : sessions;
  const sessionIds = new Set(keep.map((s) => s.id));

  const nodes = new Map<string, GraphNode>();
  const links: GraphLink[] = [];
  const fileDegree = new Map<string, number>();
  const sessionDegree = new Map<string, number>();

  for (const s of keep) {
    if (s.project) {
      const pid = `project:${s.project}`;
      if (!nodes.has(pid)) nodes.set(pid, { id: pid, type: "project", label: s.project, project: s.project, val: 4 });
      links.push({ source: `session:${s.id}`, target: pid, kind: "about" });
    }
  }

  for (const t of touched) {
    if (!sessionIds.has(t.s) || !t.path) continue;
    const fid = `file:${t.path}`;
    links.push({ source: `session:${t.s}`, target: fid, kind: "touched" });
    fileDegree.set(t.path, (fileDegree.get(t.path) ?? 0) + 1);
    sessionDegree.set(t.s, (sessionDegree.get(t.s) ?? 0) + 1);
    if (!nodes.has(fid)) {
      nodes.set(fid, { id: fid, type: "file", label: shortPath(t.path), val: 1 });
    }
  }

  for (const s of keep) {
    const deg = sessionDegree.get(s.id) ?? 0;
    nodes.set(`session:${s.id}`, {
      id: `session:${s.id}`,
      type: "session",
      label: s.title ?? s.id,
      project: s.project,
      ts: s.started_at,
      status: s.status,
      val: 3 + Math.min(deg, 12),
    });
  }
  for (const [path, deg] of fileDegree) {
    const n = nodes.get(`file:${path}`);
    if (n) n.val = 1 + Math.min(deg, 10);
  }

  return { nodes: [...nodes.values()], links };
}

export interface TimelineData {
  sessions: Array<{ id: string; title: string; project: string; started_at?: string; status?: string; files: number }>;
  projects: string[];
}

export async function timelineData(db: Surreal): Promise<TimelineData> {
  const [sessions, touched] = await Promise.all([fetchSessions(db), fetchTouched(db)]);
  const deg = new Map<string, number>();
  for (const t of touched) deg.set(t.s, (deg.get(t.s) ?? 0) + 1);
  const projects = [...new Set(sessions.map((s) => s.project ?? "(unscoped)"))].sort();
  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title ?? s.id,
      project: s.project ?? "(unscoped)",
      started_at: s.started_at,
      status: s.status,
      files: deg.get(s.id) ?? 0,
    })),
    projects,
  };
}

export interface StatsData {
  counts: { session: number; prompt: number; file: number };
  byProject: Array<{ project: string; n: number }>;
  byDay: Array<{ day: string; n: number }>;
  topFiles: Array<{ path: string; label: string; n: number }>;
}

export async function statsData(db: Surreal): Promise<StatsData> {
  const [sessions, touched] = await Promise.all([fetchSessions(db), fetchTouched(db)]);
  const [countRows] = await db.query<[Array<{ n: number; tb: string }>]>(
    `SELECT count() AS n, meta::tb(id) AS tb FROM session, prompt, file GROUP BY tb;`,
  );
  const counts = { session: 0, prompt: 0, file: 0 };
  for (const r of countRows ?? []) {
    if (r.tb in counts) (counts as Record<string, number>)[r.tb] = r.n;
  }

  const byProjectMap = new Map<string, number>();
  const byDayMap = new Map<string, number>();
  for (const s of sessions) {
    const p = s.project ?? "(unscoped)";
    byProjectMap.set(p, (byProjectMap.get(p) ?? 0) + 1);
    const day = toDay(s.started_at);
    if (day) byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
  }
  const fileDeg = new Map<string, number>();
  for (const t of touched) if (t.path) fileDeg.set(t.path, (fileDeg.get(t.path) ?? 0) + 1);

  return {
    counts,
    byProject: [...byProjectMap.entries()].map(([project, n]) => ({ project, n })).sort((a, b) => b.n - a.n),
    byDay: [...byDayMap.entries()].map(([day, n]) => ({ day, n })).sort((a, b) => a.day.localeCompare(b.day)),
    topFiles: [...fileDeg.entries()]
      .map(([path, n]) => ({ path, label: shortPath(path), n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 15),
  };
}

export interface SessionDetail {
  id: string;
  title?: string;
  summary?: string;
  project?: string;
  started_at?: string;
  status?: string;
  files: string[];
  prompts: Array<{ role: string; text: string }>;
}

export async function sessionDetail(db: Surreal, id: string): Promise<SessionDetail | null> {
  // SurrealDB 3.x: build a record id from the meta id ("<tool>::<uuid>") string.
  // Fetch prompts via graph traversal (fast) rather than `id IN (subquery)`
  // (which scans the whole prompt table).
  const rid = "session:`" + id + "`";
  const [head] = await db.query<
    [Array<Omit<SessionDetail, "prompts"> & { prompts?: Array<{ role: string; text: string }> }>]
  >(
    `SELECT meta::id(id) AS id, title, summary, project, started_at, status,
            ->touched->file.path AS files,
            ->contains->prompt.{ role, text } AS prompts
     FROM type::record($rid);`,
    { rid },
  );
  const s = head?.[0];
  if (!s) return null;
  return {
    ...s,
    files: (s.files ?? []).filter(Boolean),
    prompts: (s.prompts ?? []).filter((p) => p && p.text).slice(0, 300),
  };
}

export async function searchData(db: Surreal, q: string, project?: string): Promise<SearchHit[]> {
  if (!q.trim()) return [];
  return ftSearch(db, q, { project, limit: 30 });
}

function shortPath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join("/")}`;
}

function toDay(value: unknown): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
