/**
 * SourceAdapter is the cross-tool seam. Each tool (Cursor, Claude, Copilot, ...)
 * implements this to expose its sessions as a normalized RawEvent stream.
 */
import type { RawEvent, SessionRef } from "../core/types.ts";

export interface Disposable {
  dispose(): void;
}

export interface SourceAdapter {
  /** Stable adapter id, e.g. 'cursor'. */
  readonly id: string;

  /** Enumerate all sessions available on disk. */
  discover(): AsyncIterable<SessionRef>;

  /** Read the ordered event stream for a single session. */
  read(session: SessionRef): AsyncIterable<RawEvent>;

  /** Optional live capture (fs watcher / hook bridge). */
  watch?(onEvent: (e: RawEvent) => void): Disposable;
}
