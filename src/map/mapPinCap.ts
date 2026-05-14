/**
 * Max map pins by zoom (fewer when zoomed out — “headline” shows only).
 * @returns `null` = no cap (show all).
 */
export function mapPinCapForZoom(zoom: number): number | null {
  if (zoom >= 14) return null;
  if (zoom >= 12) return 50;
  if (zoom >= 10) return 25;
  return 10;
}
