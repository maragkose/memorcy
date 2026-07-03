import { useEffect, useRef, useState } from "react";
import { api, type SearchHit } from "../api.ts";
import { projectColor } from "../lib/colors.ts";

interface Props {
  project?: string;
  onHits: (hits: SearchHit[]) => void;
  onSelectSession: (metaId: string) => void;
}

export default function SearchBar({ project, onHits, onSelectSession }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setHits([]);
        onHits([]);
        return;
      }
      try {
        const h = await api.search(q, project);
        setHits(h);
        onHits(h);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, project]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={box} className="relative w-full max-w-md">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="Search sessions & prompts…"
        className="w-full rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
      />
      {q && (
        <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">✕</button>
      )}
      {open && hits.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-96 w-[28rem] overflow-y-auto rounded-lg border border-slate-700/70 bg-slate-950/95 shadow-2xl backdrop-blur animate-fadeIn">
          {hits.map((h) => (
            <button
              key={`${h.type}:${h.id}`}
              onClick={() => {
                if (h.type === "session") onSelectSession(h.id);
                setOpen(false);
              }}
              className="block w-full border-b border-slate-800/70 px-3 py-2 text-left last:border-0 hover:bg-slate-800/60"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${h.type === "session" ? "bg-sky-500/20 text-sky-300" : "bg-slate-700/50 text-slate-400"}`}>
                  {h.type}
                </span>
                {h.project && <span className="text-[10px]" style={{ color: projectColor(h.project) }}>{h.project}</span>}
              </div>
              <div className="mt-0.5 line-clamp-2 text-xs text-slate-300">{h.title}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
