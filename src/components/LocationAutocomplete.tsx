import { useCallback, useEffect, useId, useRef, useState } from "react";
import { geocodePlaceSuggestions, type GeocodeHit } from "../api/geocode";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Called when user picks a suggestion (map + label should update in parent). */
  onPick: (hit: GeocodeHit) => void;
  /** Enter key (same as clicking Search when wired from parent). */
  onEnterSearch?: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export function LocationAutocomplete({
  value,
  onChange,
  onPick,
  onEnterSearch,
  disabled,
  placeholder,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodeHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const hits = await geocodePlaceSuggestions(q, ac.signal, 10);
        if (ac.signal.aborted) return;
        setSuggestions(hits);
        setOpen(hits.length > 0);
      } catch {
        if (!ac.signal.aborted) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      ac.abort();
    };
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = useCallback(
    (h: GeocodeHit) => {
      onPick(h);
      onChange(h.label);
      setOpen(false);
      setSuggestions([]);
    },
    [onChange, onPick],
  );

  return (
    <div className="location-autocomplete" ref={wrapRef}>
      <input
        type="text"
        className="location-input"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !onEnterSearch) return;
          e.preventDefault();
          if (open && suggestions.length > 0) {
            pick(suggestions[0]);
            return;
          }
          setOpen(false);
          onEnterSearch();
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        autoComplete="off"
      />
      {loading && value.trim().length >= 2 ? (
        <div className="location-autocomplete-loading" aria-live="polite">
          Searching…
        </div>
      ) : null}
      {open && suggestions.length > 0 ? (
        <ul id={listId} className="location-autocomplete-list" role="listbox">
          {suggestions.map((h, i) => (
            <li key={h.id ?? `${h.lat.toFixed(4)}-${h.lng.toFixed(4)}-${i}`} role="none">
              <button
                type="button"
                className="location-autocomplete-item"
                role="option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(h);
                }}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
