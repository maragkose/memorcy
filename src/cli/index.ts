/**
 * Standalone CLI for the memory bank (works without any AI tool).
 *
 * Usage:
 *   memento init
 *   memento backfill --tool cursor
 *   memento search "surrealdb schema" [--project <slug>]
 *   memento resume --project <slug>
 *   memento export
 *   memento stats
 */
import { loadConfig } from "../core/config.ts";
import { getDb, closeDb } from "../core/db.ts";
import { applySchema } from "../core/schema.ts";
import { getAdapter } from "../adapters/registry.ts";
import { backfill } from "../ingest/backfill.ts";
import { syncDocuments } from "../ingest/notes.ts";
import { buildEnrichment } from "../enrichment/registry.ts";
import { search, resume } from "../core/queries.ts";
import { exportMdc } from "../export/mdc.ts";
import { log } from "../core/log.ts";

interface Args {
  _: string[];
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): Args {
  const _: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}

async function main(): Promise<void> {
  const { _, flags } = parseArgs(process.argv.slice(2));
  const cmd = _[0];
  const cfg = loadConfig();

  switch (cmd) {
    case "init": {
      const db = await getDb(cfg);
      await applySchema(db, { withVectors: cfg.embed !== "none" });
      console.log("schema initialized");
      break;
    }
    case "backfill": {
      const toolId = flags.tool ?? "cursor";
      const adapter = getAdapter(cfg, toolId);
      if (!adapter) throw new Error(`unknown adapter: ${toolId}`);
      const db = await getDb(cfg);
      await applySchema(db, { withVectors: cfg.embed !== "none" });
      const provider = flags["no-enrich"] ? undefined : buildEnrichment(cfg);
      const stats = await backfill(db, cfg, adapter, provider);
      console.log(`backfill: ${stats.sessions} sessions, ${stats.events} events`);
      break;
    }
    case "notes": {
      const db = await getDb(cfg);
      await applySchema(db, { withVectors: cfg.embed !== "none" });
      if (!cfg.notes.enabled) {
        console.log("notes indexing disabled (MEM_NOTES=false)");
        break;
      }
      const stats = await syncDocuments(db, cfg);
      console.log(`notes: ${stats.updated}/${stats.scanned} documents indexed (roots: ${cfg.notes.roots.join(", ")})`);
      break;
    }
    case "search": {
      const query = _.slice(1).join(" ") || flags.query || "";
      const db = await getDb(cfg);
      const hits = await search(db, query, { project: flags.project, limit: Number(flags.limit ?? 20) });
      console.log(JSON.stringify(hits, null, 2));
      break;
    }
    case "resume": {
      if (!flags.project) throw new Error("--project required");
      const db = await getDb(cfg);
      const briefing = await resume(db, flags.project);
      console.log(JSON.stringify(briefing, null, 2));
      break;
    }
    case "export": {
      const db = await getDb(cfg);
      const target = await exportMdc(db, cfg);
      console.log(`digest written to ${target}`);
      break;
    }
    case "stats": {
      const db = await getDb(cfg);
      const [rows] = await db.query(
        `SELECT count() AS n, meta::tb(id) AS tb FROM session, prompt, decision, file, document GROUP BY tb;`,
      );
      console.log(JSON.stringify(rows, null, 2));
      break;
    }
    default:
      console.log(
        [
          "memento <command>",
          "  init                      initialize schema",
          "  backfill --tool cursor    ingest existing sessions",
          "  notes                     index notes/files from configured roots",
          "  search <query>            search the memory bank",
          "  resume --project <slug>   cold-start briefing",
          "  export                    write the always-apply .mdc digest",
          "  stats                     node counts",
        ].join("\n"),
      );
  }

  await closeDb();
}

main().catch((err) => {
  log.error("cli fatal", err);
  process.exit(1);
});
