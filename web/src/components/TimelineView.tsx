import { useMemo } from "react";
import type { Timeline } from "../api.ts";
import { projectColor } from "../lib/colors.ts";

interface Props {
  data: Timeline;
  onSelectSession: (metaId: string) => void;
  highlight: Set<string>;
}

export default function TimelineView({ data, onSelectSession, highlight }: Props) {
  const { rows, min, max, ticks } = useMemo(() => {
    const dated = data.sessions.filter((s) => s.started_at);
    const times = dated.map((s) => new Date(s.started_at!).getTime());
    const min = Math.min(...times);
    const max = Math.max(...times);
    const byProject = new Map<string, typeof data.sessions>();
    for (const s of dated) {
      const arr = byProject.get(s.project) ?? [];
      arr.push(s);
      byProject.set(s.project, arr);
    }
    const rows = [...byProject.entries()].sort((a, b) => b[1].length - a[1].length);
    // Month ticks.
    const ticks: Array<{ pos: number; label: string }> = [];
    const span = max - min || 1;
    const start = new Date(min);
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur.getTime() <= max) {
      const t = cur.getTime();
      if (t >= min) ticks.push({ pos: ((t - min) / span) * 100, label: cur.toLocaleString(undefined, { month: "short", year: "2-digit" }) });
      cur.setMonth(cur.getMonth() + 1);
    }
    return { rows, min, max, ticks };
  }, [data]);

  const span = max - min || 1;
  const hasHl = highlight.size > 0;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="min-w-[720px]">
        {/* axis */}
        <div className="relative mb-2 ml-40 h-5 border-b border-slate-800">
          {ticks.map((t, i) => (
            <div key={i} className="absolute top-0 text-[10px] text-slate-500" style={{ left: `${t.pos}%` }}>
              <div className="h-2 w-px bg-slate-700" />
              <span className="ml-1">{t.label}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          {rows.map(([project, sessions]) => (
            <div key={project} className="flex items-center gap-2">
              <div className="w-40 shrink-0 truncate text-right text-xs font-medium" style={{ color: projectColor(project) }} title={project}>
                {project}
              </div>
              <div className="relative h-8 flex-1 rounded bg-slate-900/40">
                {sessions.map((s) => {
                  const left = ((new Date(s.started_at!).getTime() - min) / span) * 100;
                  const size = Math.min(18, 8 + s.files);
                  const id = `session:${s.id}`;
                  const faded = hasHl && !highlight.has(id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => onSelectSession(s.id)}
                      title={`${s.title}\n${new Date(s.started_at!).toLocaleString()} · ${s.files} files`}
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition hover:z-10 hover:scale-125"
                      style={{
                        left: `${left}%`,
                        width: size,
                        height: size,
                        background: projectColor(project),
                        borderColor: highlight.has(id) ? "#fff" : "transparent",
                        boxShadow: highlight.has(id) ? `0 0 10px ${projectColor(project)}` : "none",
                        opacity: faded ? 0.2 : 0.85,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
