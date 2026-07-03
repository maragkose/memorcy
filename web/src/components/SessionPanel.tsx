import { useEffect, useState } from "react";
import { api, type SessionDetail } from "../api.ts";
import { projectColor } from "../lib/colors.ts";

interface Props {
  sessionId: string | null;
  onClose: () => void;
}

export default function SessionPanel({ sessionId, onClose }: Props) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    setDetail(null);
    api
      .session(sessionId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (!sessionId) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md animate-fadeIn flex-col border-l border-slate-700/60 bg-slate-950/95 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 p-4">
        <div className="min-w-0">
          {detail?.project && (
            <span
              className="inline-block rounded px-2 py-0.5 text-[11px] font-medium"
              style={{ background: `${projectColor(detail.project)}22`, color: projectColor(detail.project) }}
            >
              {detail.project}
            </span>
          )}
          <h2 className="mt-1 text-sm font-semibold leading-snug text-slate-100">
            {loading ? "Loading…" : detail?.title ?? "(untitled session)"}
          </h2>
          {detail?.started_at && (
            <p className="mt-0.5 text-xs text-slate-500">{new Date(detail.started_at).toLocaleString()}</p>
          )}
        </div>
        <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">✕</button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {detail?.summary && (
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</h3>
            <p className="whitespace-pre-wrap text-sm text-slate-300">{detail.summary}</p>
          </section>
        )}

        {detail && detail.files.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Files ({detail.files.length})
            </h3>
            <ul className="space-y-1">
              {detail.files.map((f) => (
                <li key={f} className="truncate rounded bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-400" title={f}>
                  {f}
                </li>
              ))}
            </ul>
          </section>
        )}

        {detail && detail.prompts.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Transcript ({detail.prompts.length})
            </h3>
            <div className="space-y-2">
              {detail.prompts.map((p, i) => (
                <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <div className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
                    p.role === "assistant" ? "text-emerald-400" : p.role === "user" ? "text-sky-400" : "text-slate-500"
                  }`}>
                    {p.role}
                  </div>
                  <p className="line-clamp-6 whitespace-pre-wrap text-xs text-slate-300">{p.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
