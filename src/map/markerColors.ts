const PALETTE: Record<string, string> = {
  "Hip-Hop/Rap": "#e879f9",
  "R&B": "#c084fc",
  Pop: "#fb7185",
  Rock: "#f97316",
  Metal: "#94a3b8",
  Alternative: "#38bdf8",
  "Electronic / EDM": "#22d3ee",
  Folk: "#84cc16",
  Country: "#eab308",
  Jazz: "#fcd34d",
  Blues: "#60a5fa",
  Latin: "#f472b6",
  Reggae: "#4ade80",
  "World / International": "#2dd4bf",
  Classical: "#a78bfa",
  "Religious & Gospel": "#fbbf24",
  Comedy: "#facc15",
  "Special Events": "#64748b",
};

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function markerFillForParent(parent: string): string {
  if (PALETTE[parent]) return PALETTE[parent];
  const hue = hueFromString(parent);
  return `hsl(${hue} 70% 52%)`;
}
