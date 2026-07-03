import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import ForceGraph3D from "react-force-graph-3d";
import type { GraphData, GraphNode } from "../api.ts";
import { nodeColor } from "../lib/colors.ts";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

interface Props {
  data: GraphData;
  highlight: Set<string>;
  onSelectSession: (metaId: string) => void;
}

export default function GraphView({ data, highlight, onSelectSession }: Props) {
  const { ref, size } = useSize<HTMLDivElement>();
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [showFiles, setShowFiles] = useState(true);
  const fgRef = useRef<any>(null);

  // Clone so the force-graph lib can mutate its own copy (source/target -> refs).
  const graph = useMemo(() => {
    const nodes = data.nodes.filter((n) => (showFiles ? true : n.type !== "file"));
    const keep = new Set(nodes.map((n) => n.id));
    const links = data.links
      .filter((l) => keep.has(l.source as string) && keep.has(l.target as string))
      .map((l) => ({ ...l }));
    return { nodes: nodes.map((n) => ({ ...n })), links };
  }, [data, showFiles]);

  const hasHl = highlight.size > 0;
  const dim = (n: GraphNode) => hasHl && !highlight.has(n.id);

  const onClick = (n: any) => {
    if (n?.type === "session") onSelectSession(String(n.id).replace(/^session:/, ""));
    if (fgRef.current && mode === "2d") fgRef.current.centerAt(n.x, n.y, 500);
  };

  useEffect(() => {
    // Loosen link distance a touch for readability.
    const fg = fgRef.current;
    if (fg?.d3Force) {
      fg.d3Force("charge")?.strength(mode === "3d" ? -60 : -110);
    }
  }, [mode, graph]);

  return (
    <div ref={ref} className="relative h-full w-full">
      {mode === "2d" ? (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graph}
          backgroundColor="#05070d"
          cooldownTicks={120}
          nodeRelSize={4}
          nodeVal={(n: any) => n.val}
          linkColor={(l: any) => (l.kind === "about" ? "rgba(148,163,184,0.25)" : "rgba(59,130,246,0.12)")}
          linkWidth={(l: any) => (l.kind === "about" ? 1.2 : 0.5)}
          onNodeClick={onClick}
          nodeCanvasObject={(n: any, ctx, scale) => {
            const r = Math.max(2, Math.sqrt(n.val) * 2.2);
            const faded = dim(n);
            ctx.globalAlpha = faded ? 0.15 : 1;
            const col = nodeColor(n);
            if (highlight.has(n.id)) {
              ctx.shadowColor = col;
              ctx.shadowBlur = 18;
            }
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = col;
            ctx.fill();
            ctx.shadowBlur = 0;
            // Labels: projects always; sessions when zoomed in or highlighted.
            const showLabel = n.type === "project" || highlight.has(n.id) || scale > 2.2;
            if (showLabel && n.type !== "file") {
              const fs = Math.max(3, (n.type === "project" ? 5 : 3.5) / Math.min(scale, 1.4) + 3);
              ctx.font = `${fs}px ui-sans-serif, system-ui`;
              ctx.fillStyle = faded ? "rgba(229,233,240,0.3)" : "#e5e9f0";
              ctx.textAlign = "center";
              const label = String(n.label).slice(0, 40);
              ctx.fillText(label, n.x, n.y + r + fs);
            }
            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(n: any, color, ctx) => {
            const r = Math.max(4, Math.sqrt(n.val) * 2.2 + 2);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
            ctx.fill();
          }}
        />
      ) : (
        <ForceGraph3D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graph}
          backgroundColor="#05070d"
          nodeVal={(n: any) => n.val}
          nodeColor={(n: any) => (dim(n) ? "#1e293b" : nodeColor(n))}
          nodeOpacity={0.9}
          nodeLabel={(n: any) => `${n.type}: ${n.label}`}
          linkColor={(l: any) => (l.kind === "about" ? "rgba(148,163,184,0.4)" : "rgba(59,130,246,0.25)")}
          linkOpacity={0.4}
          linkWidth={(l: any) => (l.kind === "about" ? 0.6 : 0.3)}
          onNodeClick={onClick}
        />
      )}

      {/* Controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-2 animate-fadeIn">
        <div className="flex overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900/70 backdrop-blur">
          {(["2d", "3d"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                mode === m ? "bg-sky-500/90 text-white" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowFiles((v) => !v)}
          className={`rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-medium backdrop-blur transition ${
            showFiles ? "bg-slate-800/80 text-slate-200" : "bg-slate-900/70 text-slate-400 hover:bg-slate-800"
          }`}
        >
          {showFiles ? "Hide files" : "Show files"}
        </button>
        <button
          onClick={() => fgRef.current?.zoomToFit?.(600, 40)}
          className="rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300 backdrop-blur transition hover:bg-slate-800"
        >
          Fit
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex gap-3 rounded-lg border border-slate-700/60 bg-slate-900/70 px-3 py-2 text-xs text-slate-300 backdrop-blur">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-sky-400" />session</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500" />file</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-fuchsia-400" />project</span>
      </div>
    </div>
  );
}
