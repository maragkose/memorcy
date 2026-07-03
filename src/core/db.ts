/**
 * SurrealDB connection wrapper. All processes (daemon, mcp, cli) connect to the
 * same local SurrealDB daemon over WebSocket; SurrealDB is the coordination point.
 */
import { Surreal } from "surrealdb";
import type { Config } from "./config.ts";
import { log } from "./log.ts";

let singleton: Surreal | undefined;

export async function connect(cfg: Config): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(cfg.db.url, {
    namespace: cfg.db.namespace,
    database: cfg.db.database,
    authentication: { username: cfg.db.user, password: cfg.db.pass },
  });
  log.info(`connected to SurrealDB at ${cfg.db.url} (${cfg.db.namespace}/${cfg.db.database})`);
  return db;
}

export async function getDb(cfg: Config): Promise<Surreal> {
  if (!singleton) singleton = await connect(cfg);
  return singleton;
}

export async function closeDb(): Promise<void> {
  if (singleton) {
    await singleton.close();
    singleton = undefined;
  }
}
