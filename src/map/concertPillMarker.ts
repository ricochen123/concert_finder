/** Ticketmaster concert markers as SVG data URLs, with zoom-tier variants. */

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function pinDateParts(localDate: string | undefined): {
  month: string;
  day: string;
} {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    return { month: "·", day: "·" };
  }
  const [y, m, d] = localDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return { month: "·", day: "·" };
  const month = dt
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase()
    .slice(0, 3);
  return { month, day: String(d) };
}

export type ConcertMarkerResult = {
  url: string;
  width: number;
  height: number;
};

/** Zoom tiers for marker density / readability (see product spec). */
export type PinTier = "full" | "medium" | "small" | "dot";

export function pinTierForZoom(zoom: number): PinTier {
  if (zoom >= 14) return "full";
  if (zoom >= 12) return "medium";
  if (zoom >= 10) return "small";
  return "dot";
}

const FULL_W = 268;
const FULL_H = 52;

function buildFullPill(args: {
  fillColor: string;
  localDate: string | undefined;
  title: string;
  venue: string;
  extraSlots?: number;
  /** Total events at this venue when multiple acts share one pin (badge shows this count). */
  venueEventCount?: number;
}): ConcertMarkerResult {
  const { fillColor, localDate, title, venue, extraSlots, venueEventCount } =
    args;
  const { month, day } = pinDateParts(localDate);
  const venueStack =
    venueEventCount != null && venueEventCount > 1 && Number.isFinite(venueEventCount);
  const slotExtras = (extraSlots ?? 0) > 0;
  const tightTitle = venueStack || slotExtras;
  const titleLine = escapeXml(truncate(title, tightTitle ? 22 : 26));
  const venueLine = escapeXml(truncate(venue, 30));
  const badgeText = venueStack
    ? escapeXml(String(Math.round(venueEventCount!)))
    : slotExtras
      ? escapeXml(`+${extraSlots}`)
      : "+";
  const badgeFs = venueStack
    ? venueEventCount! >= 100
      ? "9"
      : venueEventCount! >= 10
        ? "10"
        : "11"
    : slotExtras
      ? "11"
      : "15";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FULL_W}" height="${FULL_H}" viewBox="0 0 ${FULL_W} ${FULL_H}">
  <defs>
    <filter id="pill-sh-f" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="2.2" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect x="1.5" y="1.5" width="${FULL_W - 3}" height="${FULL_H - 3}" rx="24" ry="24"
    fill="#fafafa" stroke="#d4d4d8" stroke-width="1" filter="url(#pill-sh-f)"/>
  <circle cx="30" cy="26" r="18" fill="${escapeXml(fillColor)}"/>
  <text x="30" y="20.5" text-anchor="middle" fill="#ffffff" font-size="8.5" font-weight="700" font-family="system-ui,Segoe UI,sans-serif">${month}</text>
  <text x="30" y="34" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="700" font-family="system-ui,Segoe UI,sans-serif">${escapeXml(day)}</text>
  <text x="56" y="24" fill="#0a0a0a" font-size="12.5" font-weight="700" font-family="system-ui,Segoe UI,sans-serif">${titleLine}</text>
  <text x="56" y="40" fill="#737373" font-size="11" font-family="system-ui,Segoe UI,sans-serif">${venueLine}</text>
  <circle cx="246" cy="26" r="14" fill="#f4f4f5" stroke="#e4e4e7" stroke-width="1"/>
  <text x="246" y="30.5" text-anchor="middle" fill="#171717" font-size="${badgeFs}" font-weight="600" font-family="system-ui,Segoe UI,sans-serif">${badgeText}</text>
</svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width: FULL_W,
    height: FULL_H,
  };
}

const MED_W = 218;
const MED_H = 44;

function buildMediumPill(args: {
  fillColor: string;
  localDate: string | undefined;
  title: string;
  venue: string;
  extraSlots?: number;
  venueEventCount?: number;
}): ConcertMarkerResult {
  const { fillColor, localDate, title, venue, extraSlots, venueEventCount } =
    args;
  const { month, day } = pinDateParts(localDate);
  const venueStack =
    venueEventCount != null && venueEventCount > 1 && Number.isFinite(venueEventCount);
  const slotExtras = (extraSlots ?? 0) > 0;
  const tightTitle = venueStack || slotExtras;
  const titleLine = escapeXml(truncate(title, tightTitle ? 18 : 20));
  const venueLine = escapeXml(truncate(venue, 24));
  const badgeText = venueStack
    ? escapeXml(String(Math.round(venueEventCount!)))
    : slotExtras
      ? escapeXml(`+${extraSlots}`)
      : "+";
  const plusFs = venueStack
    ? venueEventCount! >= 100
      ? "8"
      : venueEventCount! >= 10
        ? "9"
        : "10"
    : slotExtras
      ? "10"
      : "13";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MED_W}" height="${MED_H}" viewBox="0 0 ${MED_W} ${MED_H}">
  <defs>
    <filter id="pill-sh-m" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.8" flood-opacity="0.2"/>
    </filter>
  </defs>
  <rect x="1.5" y="1.5" width="${MED_W - 3}" height="${MED_H - 3}" rx="20" ry="20"
    fill="#fafafa" stroke="#d4d4d8" stroke-width="1" filter="url(#pill-sh-m)"/>
  <circle cx="25" cy="22" r="15" fill="${escapeXml(fillColor)}"/>
  <text x="25" y="17.5" text-anchor="middle" fill="#ffffff" font-size="7.5" font-weight="700" font-family="system-ui,Segoe UI,sans-serif">${month}</text>
  <text x="25" y="28.5" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="700" font-family="system-ui,Segoe UI,sans-serif">${escapeXml(day)}</text>
  <text x="46" y="20" fill="#0a0a0a" font-size="10.5" font-weight="700" font-family="system-ui,Segoe UI,sans-serif">${titleLine}</text>
  <text x="46" y="34" fill="#737373" font-size="9.5" font-family="system-ui,Segoe UI,sans-serif">${venueLine}</text>
  <circle cx="200" cy="22" r="12" fill="#f4f4f5" stroke="#e4e4e7" stroke-width="1"/>
  <text x="200" y="25.5" text-anchor="middle" fill="#171717" font-size="${plusFs}" font-weight="600" font-family="system-ui,Segoe UI,sans-serif">${badgeText}</text>
</svg>`;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width: MED_W,
    height: MED_H,
  };
}

const SM_W = 36;
const SM_H = 36;

/** Genre-colored disc, no text (zoom 10–11). */
function buildSmallDisc(fillColor: string): ConcertMarkerResult {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SM_W}" height="${SM_H}" viewBox="0 0 ${SM_W} ${SM_H}">
  <circle cx="18" cy="18" r="14" fill="${escapeXml(fillColor)}" stroke="#0c0d10" stroke-width="2"/>
  <circle cx="18" cy="18" r="10" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1"/>
</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width: SM_W,
    height: SM_H,
  };
}

const DOT = 14;

/** Minimal presence marker (zoom ≤9). */
function buildDot(fillColor: string): ConcertMarkerResult {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DOT}" height="${DOT}" viewBox="0 0 ${DOT} ${DOT}">
  <circle cx="7" cy="7" r="5" fill="${escapeXml(fillColor)}" stroke="#0c0d10" stroke-width="1.25"/>
</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width: DOT,
    height: DOT,
  };
}

export type ConcertMarkerArgs = {
  fillColor: string;
  localDate: string | undefined;
  title: string;
  venue: string;
  extraSlots?: number;
  /** When several acts share one map pin, badge shows total # of events at the venue. */
  venueEventCount?: number;
};

export function buildConcertMapMarker(
  tier: PinTier,
  args: ConcertMarkerArgs,
): ConcertMarkerResult {
  switch (tier) {
    case "full":
      return buildFullPill(args);
    case "medium":
      return buildMediumPill(args);
    case "small":
      return buildSmallDisc(args.fillColor);
    case "dot":
      return buildDot(args.fillColor);
    default:
      return buildFullPill(args);
  }
}
