export type FestivalFilterMode = "all" | "concerts" | "festivals";

type Props = {
  mode: FestivalFilterMode;
  onChange: (mode: FestivalFilterMode) => void;
  className?: string;
};

export function FestivalFilter({ mode, onChange, className }: Props) {
  return (
    <div
      className={`festival-filter${className ? ` ${className}` : ""}`}
      role="group"
      aria-label="Festival or concert"
    >
      <span className="festival-filter-label">Show</span>
      <div className="festival-filter-seg">
        {(
          [
            ["all", "All"],
            ["concerts", "Concerts"],
            ["festivals", "Festivals"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`festival-filter-btn${mode === key ? " active" : ""}`}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
