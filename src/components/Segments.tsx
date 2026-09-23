import { ArrowRight, Route } from "lucide-react";
import { STATUS_META } from "@/lib/constants";
import { titleCase } from "@/lib/format";
import type { BerthStatus, JourneyFilter, StationOption } from "@/lib/types";
import { cn } from "@/utils/cn";

export interface BarSegment {
  from: string;
  to: string;
  state: "vacant" | "occupied" | "repair";
}

const SEG_COLORS = {
  vacant: "#6fbf4a",
  occupied: "#9fb3d9",
  repair: "#b08576",
};

/** Proportional bar across the route showing which parts are vacant/occupied. */
export function SegmentBar({
  segments,
  idx,
  total,
  journey,
  baseline = "unknown",
  className,
}: {
  segments: BarSegment[];
  idx: Map<string, number>;
  total: number;
  journey?: { a: number; b: number } | null;
  baseline?: "unknown" | "occupied";
  className?: string;
}) {
  if (total <= 0) return null;
  return (
    <div
      className={cn("relative h-2.5 w-full overflow-hidden rounded-full", className)}
      style={{ background: baseline === "occupied" ? "#dbe3f3" : "#e2e8f0" }}
    >
      {segments.map((s, i) => {
        const f = idx.get(s.from);
        const t = idx.get(s.to);
        if (f === undefined || t === undefined || t <= f) return null;
        return (
          <div
            key={i}
            className="absolute inset-y-0"
            style={{
              left: `${(f / total) * 100}%`,
              width: `${((t - f) / total) * 100}%`,
              background: SEG_COLORS[s.state],
              borderLeft: i > 0 ? "1px solid white" : undefined,
            }}
          />
        );
      })}
      {journey && journey.b > journey.a && (
        <div
          className="absolute inset-y-0 rounded-full ring-2 ring-orange-500"
          style={{ left: `${(journey.a / total) * 100}%`, width: `${((journey.b - journey.a) / total) * 100}%` }}
        />
      )}
    </div>
  );
}

export function StatusLegend({ statuses }: { statuses: BerthStatus[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {statuses.map((s) => (
        <span key={s} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="h-3.5 w-5 rounded" style={{ background: STATUS_META[s].bg, border: `1px solid ${STATUS_META[s].border}` }} />
          {STATUS_META[s].label}
        </span>
      ))}
    </div>
  );
}

export function JourneyBar({
  stations,
  journey,
  onChange,
}: {
  stations: StationOption[];
  journey: JourneyFilter;
  onChange: (j: JourneyFilter) => void;
}) {
  if (stations.length < 2) return null;
  const fromIdx = stations.findIndex((s) => s.code === journey.from);
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-2xl border p-3 transition-colors sm:flex-row sm:items-center sm:p-4",
        journey.enabled ? "border-orange-300 bg-orange-50/70" : "border-slate-200 bg-white",
      )}
    >
      <label className="flex cursor-pointer select-none items-center gap-3">
        <span className="relative inline-flex">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={journey.enabled}
            onChange={(e) => onChange({ ...journey, enabled: e.target.checked })}
          />
          <span className="h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-orange-500" />
          <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </span>
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Route className="h-4 w-4 text-orange-500" /> Only berths free for my journey
        </span>
      </label>
      <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
        <select
          value={journey.from}
          onChange={(e) => {
            const from = e.target.value;
            const fi = stations.findIndex((s) => s.code === from);
            const ti = stations.findIndex((s) => s.code === journey.to);
            onChange({ ...journey, from, to: ti > fi ? journey.to : stations[stations.length - 1].code, enabled: true });
          }}
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold sm:max-w-[220px] sm:flex-none"
        >
          {stations.slice(0, -1).map((s, i) => (
            <option key={`${s.code}-${i}`} value={s.code}>
              {titleCase(s.name)} ({s.code})
            </option>
          ))}
        </select>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
        <select
          value={journey.to}
          onChange={(e) => onChange({ ...journey, to: e.target.value, enabled: true })}
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold sm:max-w-[220px] sm:flex-none"
        >
          {stations.map((s, i) =>
            i > fromIdx ? (
              <option key={`${s.code}-${i}`} value={s.code}>
                {titleCase(s.name)} ({s.code})
              </option>
            ) : null,
          )}
        </select>
      </div>
    </div>
  );
}
