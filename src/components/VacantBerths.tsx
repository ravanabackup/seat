import { BedDouble, Download, Filter, RefreshCw, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { groupFreeForJourney, groupVacantBerths, type VacantBerthGroup } from "@/lib/berth";
import { berthName, berthShort, className, compareCoach } from "@/lib/constants";
import { stationName } from "@/lib/format";
import type { JourneyFilter, StationOption, VacantBerthResponse } from "@/lib/types";
import { cn } from "@/utils/cn";
import { SegmentBar } from "./Segments";
import { Alert, Button, Spinner } from "./ui";

interface Props {
  cls: string | null;
  chartType: 1 | 2;
  hasChartTwo: boolean;
  onChartType: (t: 1 | 2) => void;
  data: VacantBerthResponse | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  stations: StationOption[];
  stationMap: Map<string, StationOption>;
  idx: Map<string, number>;
  journey: JourneyFilter;
  trainNo: string;
  onOpenCoach: (coach: string) => void;
}

export function VacantBerths({
  cls,
  chartType,
  hasChartTwo,
  onChartType,
  data,
  loading,
  error,
  onRetry,
  stations,
  stationMap,
  idx,
  journey,
  trainNo,
  onOpenCoach,
}: Props) {
  const [coachFilter, setCoachFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());

  const groups = useMemo(() => groupVacantBerths(data?.vbd ?? []), [data]);
  const journeyActive = journey.enabled && idx.has(journey.from) && idx.has(journey.to);
  const total = stations.length - 1;

  const coaches = useMemo(() => [...new Set(groups.map((g) => g.coachName))].sort(compareCoach), [groups]);
  const types = useMemo(() => [...new Set(groups.map((g) => g.berthCode))], [groups]);

  const filtered = useMemo(() => {
    let list: VacantBerthGroup[] = groups;
    if (journeyActive) list = list.filter((g) => groupFreeForJourney(g, idx, journey.from, journey.to));
    if (coachFilter !== "ALL") list = list.filter((g) => g.coachName === coachFilter);
    if (typeFilter.size) list = list.filter((g) => typeFilter.has(g.berthCode));
    return [...list].sort((a, b) => compareCoach(a.coachName, b.coachName) || a.berthNumber - b.berthNumber);
  }, [groups, journeyActive, idx, journey, coachFilter, typeFilter]);

  const segmentCount = filtered.reduce((s, g) => s + g.segments.length, 0);

  const exportCsv = () => {
    const rows = [["Coach", "Berth", "Type", "Cabin/Coupe", "From", "To", "Split"]];
    filtered.forEach((g) =>
      g.segments.forEach((s) =>
        rows.push([g.coachName, String(g.berthNumber), berthName(g.berthCode), s.cabinCoupeNo ?? "", s.from, s.to, String(s.splitNo)]),
      ),
    );
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `vacant-berths-${trainNo}-${cls}-chart${chartType}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  if (!cls) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center">
        <BedDouble className="h-8 w-8 text-slate-300" />
        <div className="text-sm font-semibold text-slate-600">Pick a class above to list its vacant berths</div>
        <div className="max-w-sm text-xs text-slate-400">Includes berths vacant only for part of the route — handy for current booking or TTE allocation.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-slate-900">
            Vacant berths · {className(cls)} <span className="font-mono text-slate-400">({cls})</span>
          </h3>
          <p className="text-xs text-slate-500">
            {chartType === 2 ? "Current status after the second chart" : "Based on the first chart"} · includes part-journey vacancies
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasChartTwo && (
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {([1, 2] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onChartType(t)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold transition",
                    chartType === t ? "bg-white text-[#1b2a6b] shadow-sm" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  Chart {t}
                </button>
              ))}
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={onRetry} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> Reload
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner label={`Fetching vacant ${cls} berths…`} />
      ) : error ? (
        <Alert tone="error" title="Couldn't load vacant berths" action={<Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>}>
          {error}
        </Alert>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5">
            <Filter className="ml-1 h-4 w-4 text-slate-400" />
            <select
              value={coachFilter}
              onChange={(e) => setCoachFilter(e.target.value)}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold"
            >
              <option value="ALL">All coaches ({coaches.length})</option>
              {coaches.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {types.map((t) => {
              const on = typeFilter.has(t);
              return (
                <button
                  key={t}
                  onClick={() => {
                    const next = new Set(typeFilter);
                    if (on) next.delete(t);
                    else next.add(t);
                    setTypeFilter(next);
                  }}
                  className={cn(
                    "h-8 rounded-lg px-2.5 text-xs font-bold transition",
                    on ? "bg-[#1b2a6b] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300",
                  )}
                  title={berthName(t)}
                >
                  {berthName(t).replace(" Berth", "").replace(" Seat", "")}
                </button>
              );
            })}
            <span className="ml-auto pr-1 text-xs font-semibold text-slate-500">
              {filtered.length} berth{filtered.length === 1 ? "" : "s"} · {segmentCount} segment{segmentCount === 1 ? "" : "s"}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <SearchX className="h-8 w-8 text-slate-300" />
              <div className="text-sm font-semibold text-slate-600">No vacant berths match</div>
              <div className="max-w-md text-xs text-slate-400">
                {groups.length
                  ? "Try clearing filters or switching off “Only berths free for my journey”."
                  : "IRCTC reports no vacant berths in this class for the selected chart."}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-[560px] overflow-auto">
                <table className="w-full text-sm md:min-w-[640px]">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2.5 sm:px-3">Coach</th>
                      <th className="px-2 py-2.5 sm:px-3">Berth</th>
                      <th className="px-2 py-2.5 sm:px-3">Type</th>
                      <th className="px-2 py-2.5 sm:px-3">Vacant between</th>
                      <th className="hidden w-[28%] px-3 py-2.5 md:table-cell">Route</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((g) => (
                      <tr key={g.key} className="hover:bg-indigo-50/40">
                        <td className="px-2 py-2.5 sm:px-3">
                          <button onClick={() => onOpenCoach(g.coachName)} className="rounded-md bg-slate-100 px-2 py-0.5 font-bold text-[#1b2a6b] hover:bg-indigo-100" title="Open coach layout">
                            {g.coachName}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 font-extrabold tabular-nums text-slate-900">
                          {g.berthNumber}
                          {g.cabinCoupeNo && <span className="ml-1.5 hidden text-[10px] font-medium text-slate-400 sm:inline">{g.cabinCoupe === "CB" ? "Cabin" : g.cabinCoupe === "CP" ? "Coupe" : "Bay"} {g.cabinCoupeNo}</span>}
                        </td>
                        <td className="px-2 py-2.5 sm:px-3">
                          <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-bold", g.berthCode === "L" || g.berthCode === "R" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
                            {berthShort(g.berthCode)}
                          </span>
                          <span className="ml-1.5 hidden text-xs text-slate-500 lg:inline">{berthName(g.berthCode)}</span>
                        </td>
                        <td className="px-2 py-2.5 sm:px-3">
                          <div className="flex flex-col gap-1">
                            {g.segments.map((s, i) => (
                              <span key={i} className="text-xs text-slate-700">
                                <b>{s.from}</b> → <b>{s.to}</b>
                                <span className="ml-1 hidden text-slate-400 sm:inline">
                                  ({stationName(s.from, stationMap)} – {stationName(s.to, stationMap)})
                                </span>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="hidden px-3 py-2.5 md:table-cell">
                          <SegmentBar
                            segments={g.segments.map((s) => ({ from: s.from, to: s.to, state: "vacant" as const }))}
                            idx={idx}
                            total={total}
                            baseline="occupied"
                            journey={journeyActive ? { a: idx.get(journey.from) ?? 0, b: idx.get(journey.to) ?? 0 } : null}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
