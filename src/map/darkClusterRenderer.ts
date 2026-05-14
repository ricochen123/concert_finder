import type { Cluster, ClusterStats, Renderer } from "@googlemaps/markerclusterer";
import type { Marker } from "@googlemaps/markerclusterer";

function clusterSvg(count: number): { svg: string; w: number; h: number; ax: number; ay: number } {
  const more = Math.max(0, count - 1);
  const tier = count < 10 ? "sm" : count < 50 ? "md" : "lg";
  const w = tier === "sm" ? 46 : tier === "md" ? 60 : 78;
  const h = w + 16;
  const fill = count >= 50 ? "#dc2626" : "#1a1f2e";
  const stroke = count >= 50 ? "#fecaca" : "rgba(255,255,255,0.14)";
  const r = (w / 2) * 0.82;
  const cx = w / 2;
  const cy = w / 2 - 2;
  const mainFs = tier === "sm" ? 15 : tier === "md" ? 17 : 19;
  const subFs = tier === "sm" ? 7 : tier === "md" ? 7.5 : 8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <filter id="cl-sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.35"/>
    </filter>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" filter="url(#cl-sh)"/>
  <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="#ffffff" font-size="${mainFs}" font-weight="800" font-family="system-ui,Segoe UI,sans-serif">${count}</text>
  <text x="${cx}" y="${w + 6}" text-anchor="middle" fill="rgba(255,255,255,0.88)" font-size="${subFs}" font-weight="600" font-family="system-ui,Segoe UI,sans-serif">+${more} more events</text>
</svg>`;
  return { svg, w, h, ax: cx, ay: h - 2 };
}

/** Dark-themed cluster marker with count + “+N more events” (concert-map style). */
export class DarkClusterRenderer implements Renderer {
  render(cluster: Cluster, _stats: ClusterStats, _map: google.maps.Map): Marker {
    const count = cluster.count;
    const position = cluster.position;
    const { svg, w, h, ax, ay } = clusterSvg(count);
    const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    const zIndex = 4000 + count;
    return new google.maps.Marker({
      position,
      zIndex,
      icon: {
        url,
        scaledSize: new google.maps.Size(w, h),
        anchor: new google.maps.Point(ax, ay),
      },
      optimized: true,
    }) as Marker;
  }
}
