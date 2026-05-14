/**
 * SuperCluster `radius` (pixels). Larger = merge pins from farther apart.
 * z ≥ 14: clustering disabled in {@link ZoomAwareClusterAlgorithm} (all pins).
 */
export function clusterRadiusForZoom(zoom: number): number {
  const z = Math.round(zoom);
  if (z <= 8) return 220;
  if (z <= 11) return 95;
  if (z <= 13) return 28;
  return 22;
}
