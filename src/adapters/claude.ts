/**
 * Claude Code adapter — stub. Same interface as CursorAdapter.
 * Sessions typically under ~/.claude/ (projects + transcripts). Implement in a
 * later phase once the Cursor path is proven end-to-end.
 */
import type { Config } from "../core/config.ts";
import type { RawEvent, SessionRef } from "../core/types.ts";
import type { SourceAdapter } from "./types.ts";
import { log } from "../core/log.ts";

export class ClaudeAdapter implements SourceAdapter {
  readonly id = "claude";
  constructor(private readonly cfg: Config) {}

  async *discover(): AsyncIterable<SessionRef> {
    log.debug(`claude adapter not implemented; would scan ${this.cfg.sources.claudeHome}`);
    // TODO: enumerate ~/.claude sessions.
  }

  // eslint-disable-next-line require-yield
  async *read(_session: SessionRef): AsyncIterable<RawEvent> {
    // TODO: parse Claude transcript format into RawEvents.
    return;
  }
}
