/**
 * NotesSource: indexes standalone notes/files (markdown, text, org, pdf, ...) from
 * configured roots — separate from AI-session transcripts. Walks each root by
 * mtime, applying directory/secret/size filters, and reads file content for FTS.
 *
 * Set MEM_NOTES_ROOTS to $HOME to index everything (the default ignore list keeps
 * dotdirs, caches, node_modules, and obvious secret files out).
 */
import fsp from "node:fs/promises";
import path from "node:path";
import type { Config } from "../core/config.ts";
import type { DocRef } from "../core/types.ts";
import { log } from "../core/log.ts";

// Never index likely-secret files, regardless of extension allowlist.
const SECRET_RE = /(^\.env)|(^\.?netrc)|(id_rsa)|(id_ed25519)|(\.pem$)|(\.key$)|(\.pfx$)|(\.p12$)|(\.crt$)|(credential)|(secret)|(\.kdbx$)/i;

export class NotesSource {
  readonly id = "notes";
  private cfg: Config;
  private exts: Set<string>;
  private ignore: Set<string>;

  constructor(cfg: Config) {
    this.cfg = cfg;
    this.exts = new Set(cfg.notes.exts);
    this.ignore = new Set(cfg.notes.ignoreDirs);
  }

  /** Enumerate indexable files across all configured roots. */
  async *discover(): AsyncIterable<DocRef> {
    for (const root of this.cfg.notes.roots) {
      let ok = false;
      try {
        ok = (await fsp.stat(root)).isDirectory();
      } catch {
        ok = false; // missing root: silently skip
      }
      if (!ok) continue;
      yield* this.walk(root);
    }
  }

  private async *walk(dir: string): AsyncIterable<DocRef> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir (permissions): skip
    }
    for (const ent of entries) {
      const name = ent.name;
      const full = path.join(dir, name);
      if (ent.isDirectory()) {
        if (name.startsWith(".") || this.ignore.has(name)) continue;
        yield* this.walk(full);
      } else if (ent.isFile()) {
        if (name.startsWith(".") || SECRET_RE.test(name)) continue;
        const ext = path.extname(name).toLowerCase();
        if (!this.exts.has(ext)) continue;
        let stat: import("node:fs").Stats;
        try {
          stat = await fsp.stat(full);
        } catch {
          continue;
        }
        if (stat.size > this.cfg.notes.maxBytes) continue;
        yield {
          path: full,
          title: path.basename(name, ext),
          ext,
          bytes: stat.size,
          mtime: stat.mtime.toISOString(),
        };
      }
    }
  }

  /** Extract text content for a discovered doc. Returns "" if unreadable/empty. */
  async read(ref: DocRef): Promise<string> {
    if (ref.ext === ".pdf") return this.readPdf(ref.path);
    try {
      const text = await fsp.readFile(ref.path, "utf8");
      return normalize(text);
    } catch (e) {
      log.debug(`notes: failed to read ${ref.path}`, e);
      return "";
    }
  }

  private async readPdf(file: string): Promise<string> {
    try {
      // Optional dependency: pdf-parse. If absent, PDFs are skipped gracefully.
      // Non-literal specifier keeps it out of static type resolution (no @types needed).
      const spec = "pdf-parse";
      const mod: any = await import(spec).catch(() => null);
      if (!mod) {
        log.debug("notes: pdf-parse not installed; skipping PDF content");
        return "";
      }
      const parse = mod.default ?? mod;
      const buf = await fsp.readFile(file);
      const out = await parse(buf);
      return normalize(String(out?.text ?? ""));
    } catch (e) {
      log.debug(`notes: failed to parse pdf ${file}`, e);
      return "";
    }
  }
}

/** Collapse excessive whitespace; cap runaway content already bounded by maxBytes. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Prefer the first markdown/H1 heading as the title when present. */
export function titleFrom(ref: DocRef, content: string): string {
  const m = content.match(/^\s*#\s+(.+)$/m) ?? content.match(/^\s*(.+)\n=+\s*$/m);
  const h = m?.[1]?.trim();
  return h && h.length <= 120 ? h : (ref.title ?? path.basename(ref.path));
}
