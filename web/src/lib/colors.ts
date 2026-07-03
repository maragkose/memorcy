// Deterministic per-project colors + node styling shared across views.

const PALETTE = [
  "#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa",
  "#22d3ee", "#fb7185", "#4ade80", "#e879f9", "#f59e0b",
  "#38bdf8", "#c084fc", "#2dd4bf", "#facc15", "#93c5fd",
];

const cache = new Map<string, string>();

export function projectColor(project?: string): string {
  const key = project ?? "(unscoped)";
  const hit = cache.get(key);
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const c = PALETTE[h % PALETTE.length];
  cache.set(key, c);
  return c;
}

export function nodeColor(n: { type: string; project?: string }): string {
  if (n.type === "file") return "#64748b";
  if (n.type === "project") return projectColor(n.project);
  return projectColor(n.project); // session tinted by its project
}
