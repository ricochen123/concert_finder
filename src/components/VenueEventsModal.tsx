import { useEffect, useMemo, useState } from "react";
import type { DisplayShow } from "../process/collapseShows";
import { pinDateParts } from "../map/concertPillMarker";

type SortMode = "relevance" | "date";

function longDateLine(localDate: string | undefined, fallback: string): string {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return fallback;
  const [y, mo, d] = localDate.split("-").map(Number);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return fallback;
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  open: boolean;
  venueName: string;
  rows: DisplayShow[];
  onClose: () => void;
  onSelectRow: (rowKey: string) => void;
};

export function VenueEventsModal({
  open,
  venueName,
  rows,
  onClose,
  onSelectRow,
}: Props) {
  const [sort, setSort] = useState<SortMode>("relevance");

  useEffect(() => {
    if (open) setSort("relevance");
  }, [open, venueName, rows.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "relevance") {
      copy.sort((a, b) => {
        const ma = Math.max(...a.items.map((i) => i.importanceScore));
        const mb = Math.max(...b.items.map((i) => i.importanceScore));
        if (mb !== ma) return mb - ma;
        return a.items[0].sortTimeMs - b.items[0].sortTimeMs;
      });
    } else {
      copy.sort(
        (a, b) => a.items[0].sortTimeMs - b.items[0].sortTimeMs,
      );
    }
    return copy;
  }, [rows, sort]);

  if (!open) return null;

  const count = rows.length;

  return (
    <div
      className="venue-stack-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="venue-stack-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="venue-stack-title"
      >
        <header className="venue-stack-head">
          <h2 id="venue-stack-title" className="venue-stack-title">
            {count} event{count === 1 ? "" : "s"} at {venueName}
          </h2>
          <div className="venue-stack-head-actions">
            <label className="venue-stack-sort">
              <span className="venue-stack-sort-label">Sort by</span>
              <select
                value={sort}
                onChange={(e) =>
                  setSort(e.target.value as SortMode)
                }
                className="venue-stack-select"
              >
                <option value="relevance">Relevance</option>
                <option value="date">Date</option>
              </select>
            </label>
            <button
              type="button"
              className="venue-stack-close"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>
        <div className="venue-stack-body">
          {sorted.map((row) => {
            const ev = row.items[0];
            const { month, day } = pinDateParts(ev.localDate);
            const when = longDateLine(ev.localDate, ev.dateLabel);
            return (
              <button
                key={row.key}
                type="button"
                className="venue-stack-card"
                onClick={() => onSelectRow(row.key)}
              >
                <div className="venue-stack-card-media">
                  {ev.imageUrl ? (
                    <img src={ev.imageUrl} alt="" className="venue-stack-card-img" />
                  ) : (
                    <div className="venue-stack-card-img venue-stack-card-img--ph" />
                  )}
                  <div className="venue-stack-card-date-overlay">
                    <span className="venue-stack-card-mo">{month}</span>
                    <span className="venue-stack-card-dy">{day}</span>
                  </div>
                </div>
                <div className="venue-stack-card-main">
                  <p className="venue-stack-card-artist">{ev.name}</p>
                  <p className="venue-stack-card-venue-line">
                    <span className="venue-stack-card-icon" aria-hidden>
                      ⌂
                    </span>
                    {ev.venueName}
                  </p>
                  <p className="venue-stack-card-date-line">
                    <span className="venue-stack-card-icon" aria-hidden>
                      ◷
                    </span>
                    {when}
                  </p>
                  {row.items.length > 1 ? (
                    <p className="venue-stack-card-sub">
                      {row.items.length} showtimes — tap for times
                    </p>
                  ) : ev.genreLine ? (
                    <p className="venue-stack-card-sub">{ev.genreLine}</p>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
