/**
 * Fixed UI order by mainstream cultural popularity (not local event counts).
 * Parents not listed sort after these, alphabetically, then Special Events last.
 */
export const KNOWN_PARENT_ORDER: readonly string[] = [
  "Pop",
  "Hip-Hop/Rap",
  "Electronic / EDM",
  "R&B",
  "Rock",
  "Country",
  "Latin",
  "Alternative",
  "Metal",
  "Folk",
  "Jazz",
  "Blues",
  "Classical",
  "Reggae",
  "World / International",
  "Religious & Gospel",
  "Children's Music",
];

export const SPECIAL_PARENT = "Special Events";

function n(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function isElectronicCombo(genre: string, subGenre: string): boolean {
  const g = n(genre);
  const sg = n(subGenre);
  if (g.includes("dance") && g.includes("electronic")) return true;
  if (g.includes("edm") || g === "electronic") return true;
  if (g === "pop" && /electro pop|house|techno|trance|dubstep|edm|rave|drum and bass|dnb|idm|electro\b/.test(sg))
    return true;
  if (g === "pop" && sg === "dance") return true;
  if (/^(house|techno|trance|dubstep|edm|rave)$/i.test(subGenre.trim())) return true;
  return false;
}

function isReligious(genre: string, subGenre: string, segment: string): boolean {
  const blob = `${n(segment)} ${n(genre)} ${n(subGenre)}`;
  if (n(genre) === "religious") return true;
  return (
    /\bgospel\b/.test(blob) ||
    /\bchristian\b/.test(blob) ||
    /\bpraise\b/.test(blob) ||
    /\bworship\b/.test(blob) ||
    /\bcontemporary christian\b/.test(blob) ||
    /\bchristian rap\b/.test(blob)
  );
}

function isSpecialRaw(
  genre: string,
  subGenre: string,
  segment: string,
): boolean {
  const g = genre.trim();
  const sg = subGenre.trim();
  const seg = segment.trim();
  const ng = n(g);
  const nseg = n(seg);
  if (ng === "other" || ng === "undefined" || ng === "music") return true;
  if (/performance art/i.test(g) || /performance art/i.test(seg)) return true;
  if (/fair|festival/i.test(g) || /fair|festival/i.test(seg)) return true;
  if (nseg === "miscellaneous" && !g) return true;
  if (!g && !sg) {
    if (!seg || nseg === "music" || nseg === "miscellaneous") return true;
    return false;
  }
  return false;
}

/**
 * Maps raw Ticketmaster classification strings to a **filter parent** bucket.
 * Subgenre keys use API `subGenre` (or "(no subgenre)") in the hierarchical UI.
 */
export function routeFilterParent(
  segment: string,
  genre: string,
  subGenre: string,
): string {
  const g0 = genre.trim();
  const sg0 = subGenre.trim();
  const seg0 = segment.trim();

  if (/^classical$/i.test(seg0) || n(g0).includes("classical") || n(sg0).includes("classical"))
    return "Classical";

  if (isReligious(g0, sg0, seg0)) return "Religious & Gospel";

  if (n(g0) === "world" || n(sg0) === "world") return "World / International";

  if (isElectronicCombo(g0, sg0)) return "Electronic / EDM";

  if (isSpecialRaw(g0, sg0, seg0)) return SPECIAL_PARENT;

  const ng = n(g0);
  if (/^children'?s music$/i.test(g0.trim()) || ng === "childrens music") {
    return "Children's Music";
  }

  if (g0) return g0;

  if (seg0 && n(seg0) !== "music") return seg0;

  return SPECIAL_PARENT;
}

export function filterSubKey(subGenreName: string): string {
  const t = subGenreName.trim();
  return t ? t : "(no subgenre)";
}

export function sortParentKeys(parents: string[]): string[] {
  const rest = parents.filter((p) => p !== SPECIAL_PARENT);
  const rank = (p: string) => {
    const i = KNOWN_PARENT_ORDER.indexOf(p);
    return i === -1 ? 1000 + p.charCodeAt(0) % 200 : i;
  };
  rest.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  if (parents.includes(SPECIAL_PARENT)) rest.push(SPECIAL_PARENT);
  return rest;
}
