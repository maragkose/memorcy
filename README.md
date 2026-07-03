# memento

A local-first, cross-tool **context memory bank** for AI coding sessions.

It ingests your Cursor session transcripts, builds a **labeled property graph** in
SurrealDB (nodes: sessions, prompts, files, projects; edges: `contains`, `touched`,
`about`), and feeds that memory back into every new AI chat — so a fresh session
already knows what you've been working on.

Two ways the memory reaches your editor:

1. **Rules-file injection (default, zero-config):** the daemon writes an
   always-applied Cursor rule at `~/.cursor/rules/memento.mdc`. Every chat,
   in every project, reads it automatically at start. No MCP server, no tool call,
   no admin permission.
2. **MCP + CLI:** query the graph on demand (`search`, `resume`, `stats`).

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

---

## How it works

```
Cursor transcripts                SurrealDB (graph + FTS + vectors)         Cursor
~/.cursor/projects/**/*.jsonl  ─▶  session ─contains─▶ prompt          ─▶  ~/.cursor/rules/
        │  (adapter)                   └─touched─▶ file                     memento.mdc
        │                              └─about───▶ project                  (always-applied)
        ▼                                   ▲                                     ▲
   daemon: poll for new/changed  ──────────┘   digest export (every change) ──────┘
   sessions, enrich, write graph
```

The **daemon** runs three loops:

- **Incremental ingest** — every minute it scans sources for new/changed
  transcripts (by mtime) and ingests only those. Idempotent: re-reading a grown
  transcript converges instead of duplicating.
- **Enrichment** — each session gets a deterministic summary + title (optionally
  an LLM summary / embeddings).
- **Digest export** — whenever something changes (and on a safety-net interval) it
  rewrites the `.mdc` rule file atomically.

No manual backfill needed once the daemon is running.

## Stack

- **Runtime:** Node ≥ 22 (24 recommended)
- **Store:** SurrealDB 2.x SDK / 3.x engine (property graph + full-text BM25 + HNSW vectors + LIVE change-feeds)
- **Enrichment:** deterministic (default, free, offline) + optional LLM (Ollama / OpenAI / Gemini)
- **Serving:** always-apply `.mdc` rule, CLI, MCP

## Quick start

```bash
# 1. Install (prerequisites, deps, build, .env, data dir; optional SurrealDB + MCP)
./install.sh                 # interactive;  ./install.sh --help for flags

# 2. First-time data load (start DB + init schema + backfill your transcripts)
./run.sh bootstrap

# 3. Start the services (SurrealDB + daemon)
./run.sh start
```

That's it. Open a new Cursor chat — it now sees your recent history via the
auto-generated rule file. The daemon keeps everything fresh from here on.

## Usage

### Automatic (no action needed)

The daemon maintains `~/.cursor/rules/memento.mdc`. Inspect what it feeds Cursor:

```bash
cat ~/.cursor/rules/memento.mdc
```

### On-demand queries

```bash
./run.sh cli search "surrealdb schema"                 # full-text search
./run.sh cli search "pdlc report" --project home-maragos-ai --limit 5
./run.sh cli resume --project home-maragos-ai          # cold-start briefing
./run.sh cli stats                                     # node counts
./run.sh cli export                                    # force-rewrite the .mdc now
```

Project slugs are the `## headings` in the `.mdc` file.

### Service lifecycle (`run.sh`)

| Command | Purpose |
| --- | --- |
| `./run.sh start [db\|daemon\|all]` | start services (default `all`) |
| `./run.sh stop [db\|daemon\|all]` | stop services |
| `./run.sh restart [db\|daemon\|all]` | stop then start |
| `./run.sh status` | what's running + node counts |
| `./run.sh logs [db\|daemon\|serve]` | tail a service log |
| `./run.sh bootstrap` | start db + init schema + full backfill |
| `./run.sh serve` | start the web UI / API server |

## Visualization (web UI)

A local, read-only web app to explore the graph: an interactive **2D/3D
force-graph**, a per-project **timeline**, a **stats dashboard**, and live
**search** with drill-down into any session's summary, files, and transcript.

Stack: a tiny Node `http` JSON API (`src/serve`, loopback-only) + a Vite + React +
Tailwind SPA (`web/`) with `react-force-graph` (WebGL).

```bash
# one-time: build the SPA (outputs web/dist, served by the API)
cd web && npm install && npm run build && cd ..

# start it (needs SurrealDB running)
./run.sh serve            # -> http://127.0.0.1:7077
```

For UI development with hot-reload, run the API and the Vite dev server (it proxies
`/api` to `:7077`):

```bash
./run.sh serve                       # backend API on :7077
cd web && npm run dev                # UI on :5173
```

## Configuration

Copy `.env.example` to `.env` (the installer does this). Key settings:

| Variable | Default | Description |
| --- | --- | --- |
| `MEM_DB_URL` | `ws://127.0.0.1:8000/rpc` | SurrealDB endpoint |
| `MEM_DB_USER` / `MEM_DB_PASS` | `root` / `root` | credentials |
| `MEM_DB_NS` / `MEM_DB_DB` | `memento` / `memory` | namespace / database |
| `MEM_ENRICH` | `deterministic` | `deterministic` \| `ollama` \| `openai` \| `gemini` |
| `MEM_EMBED` | `none` | `none` \| `ollama` \| `openai` \| `transformers` |
| `MEM_MDC` | `true` | write the always-apply rule file |
| `MEM_MDC_PATH` | `~/.cursor/rules/memento.mdc` | rule file location |
| `MEM_MDC_LIMIT` | `12` | max sessions in the digest |
| `MEM_MDC_INTERVAL_MS` | `300000` | digest safety-net re-export cadence |
| `MEM_INGEST_WATCH` | `true` | daemon auto-ingests new/changed sessions |
| `MEM_INGEST_INTERVAL_MS` | `60000` | ingest poll cadence |
| `MEM_SERVE_HOST` / `MEM_SERVE_PORT` | `127.0.0.1` / `7077` | web UI / API bind address |

## Manual / development

```bash
cp .env.example .env
npm install
npm run build            # compile to dist/  (run.sh prefers dist/, falls back to src/)

# run TypeScript directly during development:
npm run dev:cli -- init
npm run dev:cli -- backfill --tool cursor
npm run dev:daemon
```

`backfill` is idempotent, so it's safe to re-run for a full rebuild.

## Layout

```
src/core/        types, config, db, schema, queries, graph, log
src/adapters/    SourceAdapter + cursor / claude (stub)
src/enrichment/  EnrichmentProvider + deterministic / llm + run helper
src/export/      MdcExporter (always-apply rules-file digest)
src/ingest/      backfill (full + incremental sync) + live enrichment subscriber
src/daemon/      long-running ingest + enrichment + export process
src/mcp/         stdio MCP server
src/cli/         standalone CLI
src/serve/       read-only JSON API + static file server for the web UI
web/             Vite + React + Tailwind SPA (graph / timeline / stats / search)
install.sh       one-time machine setup
run.sh           service lifecycle (start/stop/status/logs/bootstrap/serve)
```

## Status & limitations

- **Cursor** is the implemented source; the **Claude** adapter is a stub.
- Enrichment defaults to deterministic (no network). LLM summaries/embeddings are opt-in.
- Ingest is **poll-based** (mtime diff on a short interval), which is robust and
  cheap; a true fs-watcher (`SourceAdapter.watch`) is stubbed for a future phase.
- Single-user, local-first. The DB listens on loopback with default `root` creds —
  change them for anything shared.
