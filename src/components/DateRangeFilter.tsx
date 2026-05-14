import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";

export type DateRangeValue = { start: string | null; end: string | null };

type Props = {
  value: DateRangeValue;
  onApply: (range: { start: string; end: string }) => void;
  onClear: () => void;
  /** Merged onto the root wrapper (e.g. toolbar layout). */
  className?: string;
};

function normalizeRange(a: string, b: string): { start: string; end: string } {
  if (!a && !b) return { start: "", end: "" };
  const x = a || b;
  const y = b || a;
  return x <= y ? { start: x, end: y } : { start: y, end: x };
}

/** Display ISO `YYYY-MM-DD` as month / day / year (no year-first in the pill). */
function formatIsoDateForDisplay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

export function DateRangeFilter({
  value,
  onApply,
  onClear,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const id = useId();
  const startId = `${id}-start`;
  const endId = `${id}-end`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [floatStyle, setFloatStyle] = useState<CSSProperties | null>(null);

  const reposition = useCallback(() => {
    if (!open || !wrapRef.current) {
      setFloatStyle(null);
      return;
    }
    const r = wrapRef.current.getBoundingClientRect();
    const w = Math.max(280, Math.min(340, r.width + 120));
    setFloatStyle({
      position: "fixed",
      top: Math.round(r.bottom + 6),
      left: Math.round(Math.min(r.left, window.innerWidth - w - 12)),
      width: w,
      zIndex: 8100,
      boxSizing: "border-box",
    });
  }, [open]);

  useLayoutEffect(() => {
    reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const h = () => reposition();
    window.addEventListener("resize", h);
    window.addEventListener("scroll", h, true);
    return () => {
      window.removeEventListener("resize", h);
      window.removeEventListener("scroll", h, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (open) {
      setDraftStart(value.start ?? "");
      setDraftEnd(value.end ?? "");
    }
  }, [open, value.start, value.end]);

  const summary =
    value.start && value.end
      ? value.start === value.end
        ? formatIsoDateForDisplay(value.start)
        : `${formatIsoDateForDisplay(value.start)} → ${formatIsoDateForDisplay(value.end)}`
      : "All dates";

  const apply = () => {
    const s = draftStart.trim();
    const e = draftEnd.trim();
    if (!s && !e) {
      onClear();
      setOpen(false);
      return;
    }
    const { start, end } = normalizeRange(s || e, e || s);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return;
    }
    onApply({ start, end });
    setOpen(false);
  };

  const clear = () => {
    onClear();
    setDraftStart("");
    setDraftEnd("");
    setOpen(false);
  };

  const cancel = () => {
    setDraftStart(value.start ?? "");
    setDraftEnd(value.end ?? "");
    setOpen(false);
  };

  return (
    <div
      className={`date-filter${className ? ` ${className}` : ""}`}
      ref={wrapRef}
    >
      <button
        type="button"
        className="btn date-filter-trigger"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Dates: <span className="date-filter-summary">{summary}</span>
      </button>
      {open && floatStyle ? (
        <div
          className="date-filter-popover"
          role="dialog"
          aria-label="Date range"
          style={floatStyle}
        >
          <div className="date-filter-fields">
            <label className="date-filter-field" htmlFor={startId}>
              <span>Start date</span>
              <input
                id={startId}
                type="date"
                className="date-filter-input"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
              />
            </label>
            <label className="date-filter-field" htmlFor={endId}>
              <span>End date</span>
              <input
                id={endId}
                type="date"
                className="date-filter-input"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
              />
            </label>
          </div>
          <div className="date-filter-actions">
            <button type="button" className="date-filter-reset" onClick={clear}>
              Reset
            </button>
            <div className="date-filter-actions-right">
              <button type="button" className="btn btn-ghost" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={apply}>
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
