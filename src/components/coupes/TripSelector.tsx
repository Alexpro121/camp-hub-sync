import { TRIPS, tripShort } from '@/lib/trips';

/** Segmented switch between the trips of a shift (departure / transfer / home). */
const TripSelector = ({
  value,
  onChange,
  counts,
}: {
  value: number;
  onChange: (n: number) => void;
  counts?: Record<number, number>;
}) => (
  <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border/40">
    {TRIPS.map((t) => {
      const active = t.number === value;
      const count = counts?.[t.number] ?? 0;
      return (
        <button
          key={t.number}
          type="button"
          onClick={() => onChange(t.number)}
          className={`flex-1 min-w-0 rounded-lg px-2 py-2 text-xs font-medium transition-smooth ${
            active ? 'bg-primary text-primary-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <span className="block truncate">{tripShort(t.number)}</span>
          {counts && (
            <span className={`block text-[10px] tabular-nums ${active ? 'opacity-80' : 'opacity-60'}`}>
              {count ? `${count} осіб` : '—'}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

export default TripSelector;