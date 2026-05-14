import {
  MarkerUtils,
  type Cluster,
  type Marker,
} from "@googlemaps/markerclusterer";

const LL_EPS = 1e-5;

/** True when every marker shares the same lat/lng (stacked at one venue pin). */
export function markersShareExactPosition(markers: Marker[]): boolean {
  if (markers.length < 2) return false;
  const p0 = MarkerUtils.getPosition(markers[0]);
  return markers.every((m) => {
    const p = MarkerUtils.getPosition(m);
    return (
      Math.abs(p.lat() - p0.lat()) < LL_EPS &&
      Math.abs(p.lng() - p0.lng()) < LL_EPS
    );
  });
}

/** Pan to cluster center and zoom in slightly (multi-venue geographic clusters). */
export function nudgeZoomIntoGeographicCluster(
  map: google.maps.Map,
  cluster: Cluster,
): void {
  const b = cluster.bounds;
  let c: google.maps.LatLng | null = null;
  if (b && !b.isEmpty()) c = b.getCenter() ?? null;
  if (!c) c = cluster.position as google.maps.LatLng;
  map.panTo(c);
  const z = map.getZoom() ?? 10;
  map.setZoom(Math.min(Math.max(z + 2, 4), 17));
}
