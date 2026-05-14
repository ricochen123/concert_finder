import type { ConcertListItem } from "../api/ticketmaster";

export type DisplayShow = {
  /** Stable React key — first id, or synthetic for groups */
  key: string;
  /** One or more merged same-day / same-venue / same-title shows */
  items: ConcertListItem[];
};

function normTitle(name: string | undefined): string {
  return String(name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function groupKey(ev: ConcertListItem): string {
  const d = ev.localDate ?? "unknown";
  const v = String(ev.venueName ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const t = normTitle(ev.name);
  return `${d}|${v}|${t}`;
}

/**
 * Merges obvious repeat performances (same title, venue, calendar day).
 */
export function collapseRecurringShows(events: ConcertListItem[]): DisplayShow[] {
  const map = new Map<string, ConcertListItem[]>();
  for (const ev of events) {
    const k = groupKey(ev);
    const arr = map.get(k) ?? [];
    arr.push(ev);
    map.set(k, arr);
  }
  const out: DisplayShow[] = [];
  for (const items of map.values()) {
    items.sort((a, b) => a.sortTimeMs - b.sortTimeMs);
    const first = items[0];
    const key =
      items.length === 1
        ? first.id
        : `grp:${groupKey(first)}`;
    out.push({ key, items });
  }
  out.sort((a, b) => a.items[0].sortTimeMs - b.items[0].sortTimeMs);
  return out;
}
