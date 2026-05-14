export type GeocodeHit = {
  lat: number;
  lng: number;
  label: string;
  /** Open-Meteo id when present (stable key for lists). */
  id?: number;
};

type OpenMeteoResult = {
  id?: number;
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
  country_code?: string;
};

type OpenMeteoResponse = {
  results?: OpenMeteoResult[];
};

function formatLabel(r: OpenMeteoResult): string {
  const parts = [r.name, r.admin1, r.country ?? r.country_code].filter(
    (x): x is string => !!x && String(x).trim().length > 0,
  );
  return parts.join(", ");
}

function toHit(r: OpenMeteoResult): GeocodeHit {
  return {
    lat: r.latitude,
    lng: r.longitude,
    label: formatLabel(r),
    id: typeof r.id === "number" ? r.id : undefined,
  };
}

/**
 * Free forward geocoder (no API key). Returns up to `count` matches for dropdowns.
 */
export async function geocodePlaceSuggestions(
  query: string,
  signal?: AbortSignal,
  count = 10,
): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", q);
  url.searchParams.set("count", String(Math.min(15, Math.max(1, count))));
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  if (/^\d{5}(-\d{4})?$/.test(q)) {
    url.searchParams.set("countryCode", "US");
  }
  const res = await fetch(url.toString(), { signal, cache: "no-store" });
  if (!res.ok) return [];

  const data = (await res.json()) as OpenMeteoResponse;
  const list = data.results ?? [];
  return list.map(toHit);
}

/**
 * Best single match (first result) for “Search” / Enter.
 * Tries the full string first, then the substring before the first comma — Open-Meteo’s
 * `name` search often misses long “City, State, Country” labels copied from a prior pick.
 */
export async function geocodePlace(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeHit | null> {
  const q = query.trim();
  if (!q) return null;
  const variants: string[] = [q];
  const beforeComma = q.split(",")[0]?.trim();
  if (beforeComma && beforeComma !== q) variants.push(beforeComma);
  for (const v of variants) {
    const list = await geocodePlaceSuggestions(v, signal, 8);
    if (list.length > 0) return list[0];
  }
  return null;
}
