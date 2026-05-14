import type { ConcertListItem } from "../api/ticketmaster";
import { sortParentKeys } from "./routeParent";

export type GenreSubCount = { sub: string; count: number };

export type GenreTreeNode = {
  parent: string;
  /** Total events under this parent (sum of subs). */
  count: number;
  subs: GenreSubCount[];
};

/** Subgenre rows we omit from the filter UI (still used on events for filtering). */
export function isHiddenGenreSubkey(sub: string): boolean {
  const t = sub.trim();
  if (!t) return true;
  if (t === "(no subgenre)") return true;
  if (t.toLowerCase() === "undefined") return true;
  return false;
}

export function buildGenreTree(events: ConcertListItem[]): GenreTreeNode[] {
  const byParent = new Map<string, Map<string, number>>();
  for (const ev of events) {
    const p = ev.filterParent;
    const s = ev.filterSub;
    if (!byParent.has(p)) byParent.set(p, new Map());
    const m = byParent.get(p)!;
    m.set(s, (m.get(s) ?? 0) + 1);
  }
  const parents = sortParentKeys([...byParent.keys()]);
  return parents.map((parent) => {
    const sm = byParent.get(parent)!;
    const allSubs = [...sm.entries()].map(([sub, count]) => ({ sub, count }));
    const count = allSubs.reduce((acc, x) => acc + x.count, 0);
    const subs = allSubs
      .filter((x) => !isHiddenGenreSubkey(x.sub))
      .sort((a, b) => b.count - a.count || a.sub.localeCompare(b.sub));
    return { parent, subs, count };
  });
}
