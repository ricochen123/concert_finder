import { routeFilterParent, filterSubKey } from "../genre/routeParent";
import {
  computeConsecutiveSameNameEventIds,
  eventIsFestival,
} from "../genre/festival";
import { detectTribute } from "../genre/tribute";

export type ConcertListItem = {
  id: string;
  name: string;
  url: string;
  dateLabel: string;
  venueName: string;
  lat: number;
  lng: number;
  imageUrl?: string;
  /** Display line from Ticketmaster (e.g. "Rock · Alternative Rock"). */
  genreLine: string;
  segmentName: string;
  genreName: string;
  subGenreName: string;
  /** Routed bucket for filters + map color. */
  filterParent: string;
  filterSub: string;
  sortTimeMs: number;
  localDate?: string;
  localTime?: string;
  hasTime: boolean;
  isTribute: boolean;
  /** Strict 2-of-3: ≥3 attractions, strict title words, or same name on consecutive dates. */
  isFestival: boolean;
  /** Highest `priceRanges[].max` from Ticketmaster (0 if unknown). */
  priceMax: number;
  /** Venue capacity when API provides it (0 if unknown). */
  venueCapacity: number;
  /** Max over embedded attractions’ `upcomingEvents` totals (tour footprint). */
  attractionUpcomingTotal: number;
  /** Combined ranking score for map pin culling when zoomed out. */
  importanceScore: number;
};

/** Ticketmaster allows up to 200 events per discovery page. */
export const TM_PAGE_SIZE = 200;

/** First load: this many API pages. */
export const TM_INITIAL_PAGE_BATCH = 4;

/** Each “Load more” click: extra API pages. */
export const TM_LOAD_MORE_PAGE_BATCH = 4;

/** Hard cap on API pages per search (protects quota / latency). */
export const TM_MAX_PAGES_PER_SEARCH = 20;

/**
 * First-load page count scales slightly with radius. Capped low and fetched
 * with delays/retries so dense metros (e.g. NYC at 100 mi) don’t trip “Failed to fetch”.
 */
export function initialFetchPagesForRadius(radiusMiles: number): number {
  const r = Math.min(500, Math.max(1, Math.round(radiusMiles)));
  const scaled = Math.max(TM_INITIAL_PAGE_BATCH, Math.ceil(r / 40) + 2);
  return Math.min(5, TM_MAX_PAGES_PER_SEARCH, scaled);
}

async function fetchTicketmasterJson(
  url: string,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      const res = await fetch(url, { signal });
      return res;
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) throw e;
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new Error(String(lastErr ?? "Ticketmaster request failed"));
}

export type FetchConcertsMeta = {
  totalElements: number;
  totalPages: number | null;
  startPage: number;
  pagesLoaded: number;
  hasMore: boolean;
};

type TMClassification = {
  primary?: boolean;
  segment?: { name?: string };
  genre?: { name?: string };
  subGenre?: { name?: string };
};

type TMVenue = {
  name?: string;
  location?: { latitude?: string; longitude?: string };
  capacity?: number | { value?: number | string };
  maxCapacity?: number;
};

type TMAttraction = {
  upcomingEvents?: Record<string, unknown>;
};

type TMEventImage = {
  url: string;
  width: number;
  height: number;
  /** e.g. `16_9`, `3_2`, `4_3`, `2_3` from Discovery API. */
  ratio?: string;
  fallback?: boolean;
};

type TicketmasterEvent = {
  id: string;
  name: string;
  url: string;
  priceRanges?: Array<{ min?: number; max?: number }>;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
    status?: { code?: string };
  };
  images?: TMEventImage[];
  classifications?: TMClassification[];
  _embedded?: {
    venues?: TMVenue[];
    attractions?: TMAttraction[];
  };
};

type PageInfo = {
  size?: number;
  totalElements?: number;
  totalPages?: number;
  number?: number;
};

type TicketmasterDiscoveryResponse = {
  _embedded?: { events?: TicketmasterEvent[] };
  page?: PageInfo;
};

function pickClassification(ev: TicketmasterEvent): TMClassification | undefined {
  const list = ev.classifications ?? [];
  return (
    list.find((x) => x.primary) ??
    list.find((x) => x.genre?.name || x.subGenre?.name) ??
    list[0]
  );
}

function buildGenreLine(
  segment: string,
  genre: string,
  subGenre: string,
): string {
  const g = genre.trim();
  const sg = subGenre.trim();
  if (g && sg && sg !== g) return `${g} · ${sg}`;
  if (g) return g;
  if (sg) return sg;
  if (segment.trim()) return segment.trim();
  return "Music";
}

function isCancelledEvent(ev: TicketmasterEvent): boolean {
  const code = ev.dates?.status?.code?.toLowerCase() ?? "";
  if (code.includes("cancel")) return true;
  if (/^cancelled\b/i.test(ev.name.trim())) return true;
  return false;
}

function sortTimeMsFromEvent(ev: TicketmasterEvent): { ms: number; hasTime: boolean } {
  const dt = ev.dates?.start?.dateTime;
  if (dt) {
    const t = Date.parse(dt);
    if (Number.isFinite(t)) return { ms: t, hasTime: true };
  }
  const ld = ev.dates?.start?.localDate;
  const lt = ev.dates?.start?.localTime;
  if (ld) {
    if (lt) {
      const t = Date.parse(`${ld}T${lt}`);
      if (Number.isFinite(t)) return { ms: t, hasTime: true };
    }
    const t = Date.parse(`${ld}T12:00:00`);
    if (Number.isFinite(t)) return { ms: t, hasTime: false };
  }
  return { ms: 0, hasTime: false };
}

function maxPriceFromEvent(ev: TicketmasterEvent): number {
  const pr = ev.priceRanges;
  if (!Array.isArray(pr) || pr.length === 0) return 0;
  let m = 0;
  for (const p of pr) {
    const mx = Number(p?.max);
    const mn = Number(p?.min);
    const v = Number.isFinite(mx) ? mx : Number.isFinite(mn) ? mn : 0;
    if (Number.isFinite(v)) m = Math.max(m, v);
  }
  return m;
}

function venueCapacityFromVenue(venue: TMVenue): number {
  const c = venue.capacity;
  if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  if (c && typeof c === "object") {
    const n = Number((c as { value?: number | string }).value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const mc = venue.maxCapacity;
  if (typeof mc === "number" && Number.isFinite(mc) && mc > 0) return mc;
  return 0;
}

function sumUpcomingEventsObject(ue: Record<string, unknown> | undefined): number {
  if (!ue || typeof ue !== "object") return 0;
  let s = 0;
  for (const val of Object.values(ue)) {
    if (typeof val === "number" && Number.isFinite(val) && val > 0) s += val;
  }
  return s;
}

function maxAttractionUpcoming(ev: TicketmasterEvent): number {
  const atts = ev._embedded?.attractions;
  if (!Array.isArray(atts) || atts.length === 0) return 0;
  let best = 0;
  for (const a of atts) {
    const ue = a?.upcomingEvents as Record<string, unknown> | undefined;
    best = Math.max(best, sumUpcomingEventsObject(ue));
  }
  return best;
}

function computeImportanceScore(args: {
  priceMax: number;
  venueCapacity: number;
  attractionUpcomingTotal: number;
}): number {
  const { priceMax, venueCapacity, attractionUpcomingTotal } = args;
  return (
    3 * Math.log1p(priceMax) +
    2 * Math.log1p(venueCapacity) +
    4 * Math.log1p(attractionUpcomingTotal)
  );
}

function buildDateLabel(ev: TicketmasterEvent): {
  label: string;
  hasTime: boolean;
  localDate?: string;
  localTime?: string;
} {
  const start = ev.dates?.start;
  const ld = start?.localDate;
  const lt = start?.localTime;
  const name = ev.name;

  if (ld && lt) {
    return {
      label: `${ld} · ${lt}`,
      hasTime: true,
      localDate: ld,
      localTime: lt,
    };
  }

  if (ld) {
    const passish = /\bpass\b/i.test(name) || /\d\s*[-–]\s*day/i.test(name);
    const tail = passish ? "All day" : "Time TBD";
    return { label: `${ld} · ${tail}`, hasTime: false, localDate: ld };
  }

  if (start?.dateTime) {
    const d = new Date(start.dateTime);
    if (Number.isFinite(d.getTime())) {
      return {
        label: d.toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        hasTime: true,
      };
    }
  }

  return { label: "Date TBA", hasTime: false };
}

/** Prefer portrait-leaning / promo ratios for list thumbs; wide banners last. */
function eventImageRatioRank(ratio: string | undefined): number {
  if (!ratio) return 2;
  const r = ratio.replace(/\s+/g, "").toLowerCase();
  if (r === "2_3" || r === "3_4" || r === "4_5") return 5;
  if (r === "3_2") return 4;
  if (r === "4_3") return 3;
  if (r === "16_9" || r === "16x9") return 0;
  return 2;
}

function pickBestEventImage(
  images: TMEventImage[] | undefined,
): TMEventImage | undefined {
  const list = images ?? [];
  if (list.length === 0) return undefined;
  const ranked = [...list].sort((a, b) => {
    const d = eventImageRatioRank(b.ratio) - eventImageRatioRank(a.ratio);
    if (d !== 0) return d;
    return a.width - b.width;
  });
  return ranked.find((i) => i.width >= 280) ?? ranked.at(-1);
}

function eventToItem(
  ev: TicketmasterEvent,
  consecutiveSameNameIds: Set<string>,
): ConcertListItem | null {
  if (isCancelledEvent(ev)) return null;

  const venue = ev._embedded?.venues?.[0];
  const latStr = venue?.location?.latitude;
  const lngStr = venue?.location?.longitude;
  if (!venue || latStr == null || lngStr == null) return null;
  const plat = Number(latStr);
  const plng = Number(lngStr);
  if (!Number.isFinite(plat) || !Number.isFinite(plng)) return null;

  const c = pickClassification(ev);
  const segmentName = c?.segment?.name?.trim() ?? "";
  const genreName = c?.genre?.name?.trim() ?? "";
  const subGenreName = c?.subGenre?.name?.trim() ?? "";
  const genreLine = buildGenreLine(segmentName, genreName, subGenreName);
  const filterParent = routeFilterParent(segmentName, genreName, subGenreName);
  const filterSub = filterSubKey(subGenreName);

  const { label: dateLabel, hasTime: dateHasTime, localDate, localTime } =
    buildDateLabel(ev);
  const { ms: sortTimeMs, hasTime: sortHasTime } = sortTimeMsFromEvent(ev);
  const hasTime = dateHasTime || sortHasTime;

  const img = pickBestEventImage(ev.images);

  const priceMax = maxPriceFromEvent(ev);
  const venueCapacity = venueCapacityFromVenue(venue);
  const attractionUpcomingTotal = maxAttractionUpcoming(ev);
  const importanceScore = computeImportanceScore({
    priceMax,
    venueCapacity,
    attractionUpcomingTotal,
  });

  return {
    id: ev.id,
    name: ev.name,
    url: ev.url,
    dateLabel,
    venueName: venue.name ?? "Venue TBA",
    lat: plat,
    lng: plng,
    imageUrl: img?.url,
    genreLine,
    segmentName,
    genreName,
    subGenreName,
    filterParent,
    filterSub,
    sortTimeMs,
    localDate,
    localTime,
    hasTime,
    isTribute: detectTribute(ev.name),
    isFestival: eventIsFestival({
      id: ev.id,
      name: ev.name,
      attractions: ev._embedded?.attractions,
      consecutiveSameNameIds,
    }),
    priceMax,
    venueCapacity,
    attractionUpcomingTotal,
    importanceScore,
  };
}

function buildSearchParams(args: {
  apiKey: string;
  lat: number;
  lng: number;
  radius: number;
  page: number;
}): URLSearchParams {
  const { apiKey, lat, lng, radius, page } = args;
  return new URLSearchParams({
    apikey: apiKey,
    latlong: `${lat},${lng}`,
    radius: String(radius),
    unit: "miles",
    classificationName: "music",
    size: String(TM_PAGE_SIZE),
    page: String(page),
    sort: "date,asc",
  });
}

export async function fetchConcertsNear(args: {
  apiKey: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  startPage?: number;
  maxPages?: number;
  signal?: AbortSignal;
}): Promise<{ events: ConcertListItem[]; meta: FetchConcertsMeta }> {
  const {
    apiKey,
    lat,
    lng,
    radiusMiles,
    signal,
    startPage = 0,
    maxPages = TM_INITIAL_PAGE_BATCH,
  } = args;
  const radius = Math.min(500, Math.max(1, Math.round(radiusMiles)));

  const roomLeft = TM_MAX_PAGES_PER_SEARCH - startPage;
  const effectiveMaxPages = Math.min(maxPages, Math.max(0, roomLeft));

  const byId = new Map<string, TicketmasterEvent>();
  let totalElements = 0;
  let reportedTotalPages: number | null = null;
  let pagesLoaded = 0;
  let lastBatchLen = 0;

  for (let i = 0; i < effectiveMaxPages; i++) {
    if (signal?.aborted) break;

    if (i > 0) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const page = startPage + i;
    const params = buildSearchParams({ apiKey, lat, lng, radius, page });
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
    const res = await fetchTicketmasterJson(url, signal);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ticketmaster ${res.status}: ${text.slice(0, 240)}`);
    }

    const data = (await res.json()) as TicketmasterDiscoveryResponse;
    const batch = data._embedded?.events ?? [];
    const p = data.page;
    if (p?.totalElements != null) totalElements = p.totalElements;
    if (p?.totalPages != null) reportedTotalPages = p.totalPages;

    for (const ev of batch) {
      byId.set(ev.id, ev);
    }

    lastBatchLen = batch.length;
    pagesLoaded += 1;

    if (batch.length === 0) break;
    if (batch.length < TM_PAGE_SIZE) break;
    if (reportedTotalPages != null && page + 1 >= reportedTotalPages) break;
  }

  const raw = [...byId.values()];
  const consecutiveSameNameIds = computeConsecutiveSameNameEventIds(
    raw.map((ev) => ({
      id: ev.id,
      name: ev.name,
      localDate: ev.dates?.start?.localDate,
    })),
  );
  const events: ConcertListItem[] = [];

  for (const ev of raw) {
    const item = eventToItem(ev, consecutiveSameNameIds);
    if (item) events.push(item);
  }

  const nextPageIndex = startPage + pagesLoaded;
  const underPageCap = nextPageIndex < TM_MAX_PAGES_PER_SEARCH;
  let hasMore = false;
  if (underPageCap && lastBatchLen === TM_PAGE_SIZE) {
    if (reportedTotalPages != null) {
      hasMore = nextPageIndex < reportedTotalPages;
    } else {
      hasMore = true;
    }
  }

  return {
    events,
    meta: {
      totalElements: totalElements || raw.length,
      totalPages: reportedTotalPages,
      startPage,
      pagesLoaded,
      hasMore,
    },
  };
}
