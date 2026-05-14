const TRIBUTE_RE =
  /\b(tribute|experience|celebrating|salute to|the music of|a night of|performs the songs of)\b/i;

export function detectTribute(name: string): boolean {
  return TRIBUTE_RE.test(name);
}
