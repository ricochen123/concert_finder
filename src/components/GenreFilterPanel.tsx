import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { CSSProperties } from "react";
import type { GenreTreeNode } from "../genre/genreTree";
import {
  type GenreSelectionMap,
  parentCheckboxState,
  type ParentGenreSel,
} from "../genre/genreSelection";
import { SPECIAL_PARENT } from "../genre/routeParent";

type Props = {
  className?: string;
  tree: GenreTreeNode[];
  selection: GenreSelectionMap;
  onSelectionChange: (next: GenreSelectionMap) => void;
  showSpecialEvents: boolean;
  onShowSpecialEventsChange: (v: boolean) => void;
  specialAvailable: boolean;
  onDeselectAll?: () => void;
  onSelectAll?: () => void;
};

function toggleParent(
  node: GenreTreeNode,
  row: ParentGenreSel | undefined,
): ParentGenreSel {
  const state = parentCheckboxState(node, row);
  if (state === "checked") return { mode: "none", subs: null };
  return { mode: "all", subs: null };
}

function toggleSub(
  node: GenreTreeNode,
  sub: string,
  row: ParentGenreSel | undefined,
): ParentGenreSel {
  const allSubs = node.subs.map((s) => s.sub);
  if (!row || row.mode === "none") {
    return { mode: "some", subs: [sub] };
  }
  if (row.mode === "all") {
    const next = allSubs.filter((s) => s !== sub);
    if (next.length === 0) return { mode: "none", subs: null };
    if (next.length === allSubs.length) return { mode: "all", subs: null };
    return { mode: "some", subs: next };
  }
  const set = new Set(row.subs ?? []);
  if (set.has(sub)) set.delete(sub);
  else set.add(sub);
  const arr = allSubs.filter((s) => set.has(s));
  if (arr.length === 0) return { mode: "none", subs: null };
  if (arr.length === allSubs.length) return { mode: "all", subs: null };
  return { mode: "some", subs: arr };
}

function ParentCheckbox({
  state,
  onChange,
}: {
  state: "checked" | "unchecked" | "indeterminate";
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === "indeterminate";
    }
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "checked"}
      onChange={onChange}
    />
  );
}

function useExpandedParents(tree: GenreTreeNode[]): [
  Record<string, boolean>,
  Dispatch<SetStateAction<Record<string, boolean>>>,
] {
  const initial = useMemo(() => {
    const o: Record<string, boolean> = {};
    for (const n of tree) {
      o[n.parent] = n.subs.length > 1;
    }
    return o;
  }, [tree]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(initial);

  useEffect(() => {
    setExpanded((prev) => {
      const next = { ...prev };
      for (const n of tree) {
        if (next[n.parent] === undefined) {
          next[n.parent] = n.subs.length > 1;
        }
      }
      for (const k of Object.keys(next)) {
        if (!tree.some((t) => t.parent === k)) delete next[k];
      }
      return next;
    });
  }, [tree]);

  return [expanded, setExpanded];
}

export function GenreFilterPanel({
  className,
  tree,
  selection,
  onSelectionChange,
  showSpecialEvents,
  onShowSpecialEventsChange,
  specialAvailable,
  onDeselectAll,
  onSelectAll,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useExpandedParents(tree);
  const baseId = useId();
  const toggleId = `${baseId}-toggle`;
  const regionId = `${baseId}-region`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [floatStyle, setFloatStyle] = useState<CSSProperties | null>(null);

  const updateFloatStyle = useCallback(() => {
    if (!filtersOpen || !wrapRef.current) {
      setFloatStyle(null);
      return;
    }
    const r = wrapRef.current.getBoundingClientRect();
    const w = Math.max(280, Math.min(380, r.width));
    setFloatStyle({
      position: "fixed",
      top: Math.round(r.bottom + 6),
      left: Math.round(r.left),
      width: w,
      zIndex: 8000,
      maxHeight: "min(70vh, 26rem)",
      overflowY: "auto",
      boxSizing: "border-box",
    });
  }, [filtersOpen]);

  useLayoutEffect(() => {
    updateFloatStyle();
  }, [filtersOpen, updateFloatStyle, tree.length]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onReposition = () => updateFloatStyle();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [filtersOpen, updateFloatStyle]);

  const setRow = (parent: string, nextRow: ParentGenreSel) => {
    onSelectionChange({ ...selection, [parent]: nextRow });
  };

  return (
    <div
      ref={wrapRef}
      className={`genre-panel-wrap${className ? ` ${className}` : ""}`}
    >
      <div className="genre-panel">
        <button
          type="button"
          id={toggleId}
          className="genre-panel-toggle"
          aria-expanded={filtersOpen}
          aria-controls={regionId}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <span className="genre-panel-toggle-label">Genres & filters</span>
          <span className="genre-panel-toggle-chevron" aria-hidden>
            {filtersOpen ? "▼" : "▶"}
          </span>
        </button>
      </div>

      {filtersOpen && floatStyle ? (
        <div
          className="genre-panel-body genre-panel-body--floating"
          id={regionId}
          role="region"
          aria-labelledby={toggleId}
          style={floatStyle}
        >
          {onDeselectAll || onSelectAll ? (
            <div className="genre-panel-bulk-row">
              {onSelectAll ? (
                <button
                  type="button"
                  className="genre-panel-bulk-btn genre-panel-bulk-btn--primary"
                  onClick={onSelectAll}
                >
                  Select all genres
                </button>
              ) : null}
              {onDeselectAll ? (
                <button
                  type="button"
                  className="genre-panel-bulk-btn"
                  onClick={onDeselectAll}
                >
                  Deselect all genres
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="genre-panel-tree" role="tree">
            {tree.map((node) => {
              const row = selection[node.parent];
              const pState = parentCheckboxState(node, row);
              const isOpen = expanded[node.parent] ?? false;
              const chevron = isOpen ? "▼" : "▶";
              const hasSubs = node.subs.length > 0;
              return (
                <div className="genre-panel-parent" key={node.parent} role="treeitem">
                  <div className="genre-panel-parent-row">
                    {hasSubs ? (
                      <button
                        type="button"
                        className="genre-panel-expand"
                        aria-expanded={isOpen}
                        aria-label={
                          isOpen ? "Collapse subgenres" : "Expand subgenres"
                        }
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [node.parent]: !isOpen,
                          }))
                        }
                      >
                        {chevron}
                      </button>
                    ) : null}
                    <label className="genre-panel-parent-label">
                      <ParentCheckbox
                        state={pState}
                        onChange={() => setRow(node.parent, toggleParent(node, row))}
                      />
                      <span className="genre-panel-parent-text">
                        {node.parent}
                        <span className="genre-panel-count"> ({node.count})</span>
                      </span>
                    </label>
                  </div>
                  {hasSubs && isOpen ? (
                    <div className="genre-panel-subs" role="group">
                      {node.subs.map((s) => {
                        const included =
                          row?.mode === "all" ||
                          (row?.mode === "some" && (row.subs ?? []).includes(s.sub));
                        return (
                          <label key={s.sub} className="genre-panel-sub">
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={() =>
                                setRow(node.parent, toggleSub(node, s.sub, row))
                              }
                            />
                            <span>
                              {s.sub}
                              <span className="genre-panel-count"> ({s.count})</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <label className="genre-panel-special">
            <input
              type="checkbox"
              checked={showSpecialEvents}
              onChange={(e) => onShowSpecialEventsChange(e.target.checked)}
              disabled={!specialAvailable}
            />
            <span>
              Show {SPECIAL_PARENT.toLowerCase()}
              {!specialAvailable ? " (none in results)" : ""}
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}
