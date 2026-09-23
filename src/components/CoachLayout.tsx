import { ArmchairIcon, Check, Info, MousePointerClick, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { berthFreeForJourney, berthStatus, groupByCabin, sortedSegments } from "@/lib/berth";
import { STATUS_META, berthName, berthShort, className } from "@/lib/constants";
import { stationLabel } from "@/lib/format";
import type { BerthDetail, BerthStatus, CoachComposition, CoachDetail, JourneyFilter, StationOption } from "@/lib/types";
import { cn } from "@/utils/cn";
import { SegmentBar, StatusLegend } from "./Segments";
import { Alert, Button, Spinner } from "./ui";

interface Props {
  coach: CoachDetail | null;
  data: CoachComposition | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  stations: StationOption[];
  stationMap: Map<string, StationOption>;
  idx: Map<string, number>;
  journey: JourneyFilter;
  chartTwo: boolean;
}

export function CoachLayout({ coach, data, loading, error, onRetry, stations, stationMap, idx, journey, chartTwo }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const bdd = useMemo(() => data?.bdd ?? [], [data]);
  const groups = useMemo(() => groupByCabin(bdd), [bdd]);
  const journeyActive = journey.enabled && idx.has(journey.from) && idx.has(journey.to);

  const counts = useMemo(() => {
    const c: Record<BerthStatus, number> = { VACANT: 0, PARTIAL: 0, FULL: 0, DMGD: 0, NA: 0 };
    bdd.forEach((b) => (c[berthStatus(b)] += 1));
    return c;
  }, [bdd]);

  const freeForJourney = useMemo(() => {
    if (!journeyActive) return new Set<number>();
    return new Set(bdd.filter((b) => berthFreeForJourney(b, idx, journey.from, journey.to)).map((b) => b.berthNo));
  }, [bdd, idx, journey, journeyActive]);

  if (!coach) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center">
        <MousePointerClick className="h-8 w-8 text-slate-300" />
        <div className="text-sm font-semibold text-slate-600">Select a coach from the train above</div>
        <div className="max-w-sm text-xs text-slate-400">You'll see every berth, colour-coded by occupancy, and which segments of the route are free.</div>
      </div>
    );
  }
  if (loading) return <Spinner label={`Loading layout of coach ${coach.coachName}…`} />;
  if (error)
    return (
      <Alert tone="error" title={`Couldn't load coach ${coach.coachName}`} action={<Button size="sm" variant="secondary" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>}>
        {error}
      </Alert>
    );
  if (!bdd.length) return <Alert tone="info" title="No berth data">IRCTC returned no berth details for this coach.</Alert>;

  const selectedBerth = bdd.find((b) => b.berthNo === selected) ?? null;
  const legendStatuses: BerthStatus[] = ["VACANT", "PARTIAL", "FULL"];
  if (counts.DMGD) legendStatuses.push("DMGD");
  if (counts.NA) legendStatuses.push("NA");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ArmchairIcon className="h-5 w-5 text-[#1b2a6b]" />
            <h3 className="text-lg font-extrabold text-slate-900">Coach {coach.coachName}</h3>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              {coach.classCode} · {className(coach.classCode)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {bdd.length} berths · <b className="text-emerald-700">{counts.VACANT} vacant</b> · <b className="text-amber-700">{counts.PARTIAL} part-occupied</b> ·{" "}
            {counts.FULL} occupied
            {journeyActive && (
              <>
                {" "}· <b className="text-orange-600">{freeForJourney.size} free for {journey.from} → {journey.to}</b>
              </>
            )}
          </div>
        </div>
        <StatusLegend statuses={legendStatuses} />
      </div>

      {chartTwo && (
        <Alert tone="warning">
          The second chart has been prepared. The official site shows coach layouts based on the first chart — use the
          <b> Vacant berths</b> tab (Chart 2) for the current status.
        </Alert>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.key} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
              <div className="mb-2 flex items-center justify-between px-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{g.label}</span>
                <span className="text-[10px] text-slate-400">
                  {g.main.length + g.side.length} berths
                </span>
              </div>
              <div className="flex gap-2">
                <div className={cn("grid flex-1 gap-1.5", g.main.length > 1 ? "grid-cols-2" : "grid-cols-1")} style={{ gridAutoFlow: "column", gridTemplateRows: `repeat(${Math.max(1, Math.ceil(g.main.length / 2))}, minmax(0, 1fr))` }}>
                  {g.main.map((b) => (
                    <BerthTile
                      key={b.berthNo}
                      b={b}
                      selected={selected === b.berthNo}
                      journeyActive={journeyActive}
                      free={freeForJourney.has(b.berthNo)}
                      onClick={() => setSelected(b.berthNo === selected ? null : b.berthNo)}
                    />
                  ))}
                </div>
                {g.side.length > 0 && (
                  <div className="flex w-[30%] flex-col justify-between gap-1.5 border-l border-dashed border-slate-300 pl-2">
                    {g.side.map((b) => (
                      <BerthTile
                        key={b.berthNo}
                        b={b}
                        selected={selected === b.berthNo}
                        journeyActive={journeyActive}
                        free={freeForJourney.has(b.berthNo)}
                        onClick={() => setSelected(b.berthNo === selected ? null : b.berthNo)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <BerthPanel berth={selectedBerth} coach={coach} stations={stations} stationMap={stationMap} idx={idx} journey={journeyActive ? journey : null} />
        </div>
      </div>
    </div>
  );
}

function BerthTile({
  b,
  selected,
  journeyActive,
  free,
  onClick,
}: {
  b: BerthDetail;
  selected: boolean;
  journeyActive: boolean;
  free: boolean;
  onClick: () => void;
}) {
  const status = berthStatus(b);
  const meta = STATUS_META[status];
  return (
    <button
      onClick={onClick}
      title={`${b.berthNo} · ${berthName(b.berthCode)} · ${meta.label}`}
      className={cn(
        "relative flex h-10 min-w-0 items-center justify-between gap-1 rounded-lg px-2 text-left transition-all hover:scale-[1.04] hover:shadow",
        selected && "ring-2 ring-[#1b2a6b] ring-offset-1",
        journeyActive && !free && "opacity-35",
        journeyActive && free && "ring-2 ring-orange-500",
      )}
      style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.text }}
    >
      <span className="text-sm font-extrabold tabular-nums">{b.berthNo}</span>
      <span className="text-[10px] font-bold opacity-80">{berthShort(b.berthCode)}</span>
      {journeyActive && free && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-white">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function BerthPanel({
  berth,
  coach,
  stations,
  stationMap,
  idx,
  journey,
}: {
  berth: BerthDetail | null;
  coach: CoachDetail;
  stations: StationOption[];
  stationMap: Map<string, StationOption>;
  idx: Map<string, number>;
  journey: JourneyFilter | null;
}) {
  if (!berth) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
        <Info className="mx-auto h-6 w-6 text-slate-300" />
        <div className="mt-2 text-sm font-semibold text-slate-600">Berth details</div>
        <p className="mt-1 text-xs text-slate-400">Click any berth to see which stretches of the journey it is booked or free.</p>
      </div>
    );
  }
  const status = berthStatus(berth);
  const meta = STATUS_META[status];
  const segs = sortedSegments(berth);
  const total = stations.length - 1;
  const free = journey ? berthFreeForJourney(berth, idx, journey.from, journey.to) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 p-4" style={{ background: meta.bg, color: meta.text }}>
        <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-white/60">
          <span className="text-lg font-extrabold leading-none">{berth.berthNo}</span>
          <span className="text-[10px] font-bold">{berthShort(berth.berthCode)}</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-extrabold">
            {coach.coachName} / {berth.berthNo} · {berthName(berth.berthCode)}
          </div>
          <div className="text-xs font-semibold opacity-80">{meta.label}</div>
          {(berth.cabinCoupeNameNo || berth.cabinCoupeNo) && (
            <div className="text-[11px] opacity-70">
              {berth.cabinCoupe === "CB" ? "Cabin" : berth.cabinCoupe === "CP" ? "Coupe" : "Bay"} {berth.cabinCoupeNameNo ?? berth.cabinCoupeNo}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-3 p-4">
        {total > 0 && (
          <SegmentBar
            segments={segs.map((s) => ({ from: s.from, to: s.to, state: s.quota === "DMGD" ? "repair" : s.occupancy ? "occupied" : "vacant" }))}
            idx={idx}
            total={total}
            journey={journey ? { a: idx.get(journey.from) ?? 0, b: idx.get(journey.to) ?? 0 } : null}
          />
        )}
        {free !== null && (
          <div className={cn("rounded-lg px-3 py-2 text-xs font-bold", free ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")}>
            {free ? `✓ Free for your journey ${journey!.from} → ${journey!.to}` : `✗ Not free for the whole of ${journey!.from} → ${journey!.to}`}
          </div>
        )}
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {segs.map((s, i) => (
            <li key={i} className="flex items-start justify-between gap-2 px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800">
                  {stationLabel(s.from, stationMap)} → {stationLabel(s.to, stationMap)}
                </div>
                {s.quota && <div className="text-[11px] text-slate-400">Quota: {s.quota}</div>}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                  s.quota === "DMGD" ? "bg-[#C19C8F] text-[#3b2119]" : s.occupancy ? "bg-[#D9E2F3] text-[#23355c]" : "bg-[#A8D08D] text-[#1f3d10]",
                )}
              >
                {s.quota === "DMGD" ? "Repair" : s.occupancy ? "Occupied" : "Vacant"}
              </span>
            </li>
          ))}
          {!segs.length && <li className="px-3 py-2 text-xs text-slate-500">No segment data.</li>}
        </ul>
      </div>
    </div>
  );
}
