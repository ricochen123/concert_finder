import type { DisplayShow } from "../process/collapseShows";

const COORD_ROUND = 1e4; /** ~11 m — merges typical TM lat/lng jitter at one venue */

function roundCoord(n: number): number {
  return Math.round(n * COORD_ROUND) / COORD_ROUND;
}

function normVenue(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Groups map rows that belong to the same venue footprint on the map. */
export function venueMapBucketKeyFromEvent(ev: {
  lat: number;
  lng: number;
  venueName: string;
}): string {
  return `${normVenue(ev.venueName)}|${roundCoord(ev.lat)}|${roundCoord(ev.lng)}`;
}

export type VenueMapGroup = {
  /** Stable id for clustering / effects */
  key: string;
  venueName: string;
  centerLat: number;
  centerLng: number;
  rows: DisplayShow[];
};

export function groupDisplayShowsForVenueMap(
  rows: DisplayShow[],
): VenueMapGroup[] {
  const byBucket = new Map<string, DisplayShow[]>();
  for (const row of rows) {
    const ev = row.items[0];
    const bk = venueMapBucketKeyFromEvent(ev);
    const arr = byBucket.get(bk) ?? [];
    arr.push(row);
    byBucket.set(bk, arr);
  }
  const out: VenueMapGroup[] = [];
  for (const [bucketKey, groupRows] of byBucket) {
    groupRows.sort(
      (a, b) => a.items[0].sortTimeMs - b.items[0].sortTimeMs,
    );
    let latSum = 0;
    let lngSum = 0;
    let n = 0;
    for (const r of groupRows) {
      for (const it of r.items) {
        latSum += it.lat;
        lngSum += it.lng;
        n += 1;
      }
    }
    const first = groupRows[0].items[0];
    const centerLat = n > 0 ? latSum / n : first.lat;
    const centerLng = n > 0 ? lngSum / n : first.lng;
    out.push({
      key: `venue:${bucketKey}`,
      venueName: first.venueName,
      centerLat,
      centerLng,
      rows: groupRows,
    });
  }
  out.sort(
    (a, b) =>
      a.rows[0].items[0].sortTimeMs - b.rows[0].items[0].sortTimeMs,
  );
  return out;
}

export function venueGroupImportance(g: VenueMapGroup): number {
  let m = 0;
  for (const r of g.rows) {
    for (const it of r.items) {
      m = Math.max(m, it.importanceScore);
    }
  }
  return m;
}

export function venueGroupEventTotal(g: VenueMapGroup): number {
  return g.rows.reduce((acc, r) => acc + r.items.length, 0);
}

/** Row to feature on the pill (highest importance, then soonest). */
export function headlineRowForVenueGroup(g: VenueMapGroup): DisplayShow {
  return [...g.rows].sort((a, b) => {
    const sa = Math.max(...a.items.map((i) => i.importanceScore));
    const sb = Math.max(...b.items.map((i) => i.importanceScore));
    if (sb !== sa) return sb - sa;
    return a.items[0].sortTimeMs - b.items[0].sortTimeMs;
  })[0];
}
