/** Word-boundary match only: festival, fest, deathfest, glow (no tour, presents, etc.). */
const STRICT_FESTIVAL_TITLE_RE =
  /\b(festival|fest|deathfest|glow)\b/i;

export function festivalTitleKeywordsStrict(name: string): boolean {
  return STRICT_FESTIVAL_TITLE_RE.test(name);
}

/** Condition (1): three or more attractions that each have a display name (TM often embeds extra nameless stubs). */
export function attractionsAtLeastThree(
  attractions: unknown[] | undefined,
): boolean {
  if (!Array.isArray(attractions)) return false;
  const named = attractions.filter((a) => {
    if (!a || typeof a !== "object") return false;
    const name = (a as { name?: string }).name?.trim();
    return !!name && name.length > 0;
  });
  return named.length >= 3;
}

function parseLocalDateMs(localDate: string | undefined): number | null {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const t = Date.parse(`${localDate}T12:00:00`);
  return Number.isFinite(t) ? t : null;
}

function normalizeEventName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const DAY_MS = 86_400_000;

/**
 * Condition (3): same normalized event name on at least two calendar days
 * that are consecutive (d, d+1). Any event id in such a pair is included.
 */
export function computeConsecutiveSameNameEventIds(
  rows: Array<{ id: string; name: string; localDate?: string | undefined }>,
): Set<string> {
  const byName = new Map<string, Array<{ id: string; ms: number }>>();
  for (const row of rows) {
    const key = normalizeEventName(row.name);
    if (!key) continue;
    const ms = parseLocalDateMs(row.localDate);
    if (ms == null) continue;
    let arr = byName.get(key);
    if (!arr) {
      arr = [];
      byName.set(key, arr);
    }
    arr.push({ id: row.id, ms });
  }

  const out = new Set<string>();
  for (const [, group] of byName) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.ms - b.ms);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const diffDays = Math.round((group[j].ms - group[i].ms) / DAY_MS);
        if (diffDays === 1) {
          out.add(group[i].id);
          out.add(group[j].id);
        }
      }
    }
  }
  return out;
}

export type StrictFestivalArgs = {
  id: string;
  name: string;
  attractions: unknown[] | undefined;
  consecutiveSameNameIds: ReadonlySet<string>;
};

/**
 * Festival only when at least two of:
 * (1) ≥3 attractions, (2) strict title keywords, (3) same name on consecutive dates.
 */
export function eventIsFestival(args: StrictFestivalArgs): boolean {
  const c1 = attractionsAtLeastThree(args.attractions);
  const c2 = festivalTitleKeywordsStrict(args.name);
  const c3 = args.consecutiveSameNameIds.has(args.id);
  return [c1, c2, c3].filter(Boolean).length >= 2;
}
