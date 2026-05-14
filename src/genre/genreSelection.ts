import type { GenreTreeNode } from "./genreTree";

export type ParentGenreMode = "all" | "none" | "some";

export type ParentGenreSel = {
  mode: ParentGenreMode;
  /** When mode is `some`, which sub-keys are included. */
  subs: string[] | null;
};

export type GenreSelectionMap = Record<string, ParentGenreSel>;

export function initGenreSelection(tree: GenreTreeNode[]): GenreSelectionMap {
  const out: GenreSelectionMap = {};
  for (const node of tree) {
    out[node.parent] = { mode: "none", subs: null };
  }
  return out;
}

/** Every parent bucket included (all subgenres on). */
export function selectAllGenres(
  tree: GenreTreeNode[],
  prev?: GenreSelectionMap,
): GenreSelectionMap {
  const out: GenreSelectionMap = { ...(prev ?? {}) };
  for (const node of tree) {
    out[node.parent] = { mode: "all", subs: null };
  }
  return out;
}

export function deselectAllGenres(
  tree: GenreTreeNode[],
  prev?: GenreSelectionMap,
): GenreSelectionMap {
  const keys = new Set<string>(tree.map((n) => n.parent));
  if (prev) for (const k of Object.keys(prev)) keys.add(k);
  const out: GenreSelectionMap = {};
  for (const k of keys) out[k] = { mode: "none", subs: null };
  return out;
}

/**
 * When the tree gains parents or subs (e.g. load more), keep prior choices.
 * Parents left in `all` stay `all`. `none` stays `none`. For `some`, only subs
 * the user already selected are kept (intersected with the new tree) — never
 * auto-widen to other subgenres or flip to `all` when the tree shrinks.
 */
export function mergeGenreSelection(
  prev: GenreSelectionMap,
  tree: GenreTreeNode[],
): GenreSelectionMap {
  const out: GenreSelectionMap = { ...prev };
  for (const node of tree) {
    const subKeys = node.subs.map((s) => s.sub);
    const existing = out[node.parent];
    if (!existing) {
      out[node.parent] = { mode: "none", subs: null };
      continue;
    }
    if (existing.mode === "all") {
      out[node.parent] = { mode: "all", subs: null };
      continue;
    }
    if (existing.mode === "none") {
      out[node.parent] = { mode: "none", subs: null };
      continue;
    }
    // "some" — only keep subs the user explicitly chose that still exist in the
    // new tree. Do not auto-add other subs from the tree (that collapsed K-pop
    // into "all Pop" when the tree temporarily listed a single subgenre).
    const picked = (existing.subs ?? []).filter((s) => subKeys.includes(s));
    if (picked.length === 0) out[node.parent] = { mode: "none", subs: null };
    else out[node.parent] = { mode: "some", subs: picked };
  }
  return out;
}

export function eventPassesGenreSelection(
  ev: { filterParent: string; filterSub: string },
  sel: GenreSelectionMap,
): boolean {
  const row = sel[ev.filterParent];
  if (!row) return false;
  if (row.mode === "none") return false;
  if (row.mode === "all") return true;
  const set = new Set(row.subs ?? []);
  return set.has(ev.filterSub);
}

export function parentCheckboxState(
  node: GenreTreeNode,
  row: ParentGenreSel | undefined,
): "checked" | "unchecked" | "indeterminate" {
  if (!row || row.mode === "none") return "unchecked";
  if (row.mode === "all") return "checked";
  const n = row.subs?.length ?? 0;
  if (n === 0) return "unchecked";
  if (n === node.subs.length) return "checked";
  return "indeterminate";
}
