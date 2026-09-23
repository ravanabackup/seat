import { BedDouble, LayoutGrid, Rows3, TrainTrack } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCoachComposition, getVacantBerths, type ChartContext } from "@/lib/api";
import { stationIndex } from "@/lib/berth";
import { ConnectionError } from "@/lib/transport";
import type {
  CoachComposition,
  CoachDetail,
  JourneyFilter,
  SearchParams,
  Settings,
  TrainComposition,
  TrainSchedule,
  VacantBerthResponse,
} from "@/lib/types";
import { cn } from "@/utils/cn";
import { ChartSummary } from "./ChartSummary";
import { ClassSummary, CoachStrip, summarizeClasses } from "./Composition";
import { CoachLayout } from "./CoachLayout";
import { JourneyBar } from "./Segments";
import { VacantBerths } from "./VacantBerths";
import { Alert, Card, SectionTitle } from "./ui";

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

interface Props {
  composition: TrainComposition;
  params: SearchParams;
  schedule: TrainSchedule | null;
  settings: Settings;
  isDemo: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onConnectionProblem: () => void;
}

export function ResultsView({ composition, params, schedule, settings, isDemo, onRefresh, refreshing, onConnectionProblem }: Props) {
  const stations = useMemo(() => schedule?.stations ?? [], [schedule]);
  const stationMap = useMemo(() => new Map(stations.map((s) => [s.code, s])), [stations]);
  const idx = useMemo(() => stationIndex(stations), [stations]);
  const cdd = useMemo(() => composition.cdd ?? [], [composition]);
  const classRows = useMemo(() => summarizeClasses(cdd), [cdd]);
  const hasChartTwo = !!composition.chartTwoDate;
  const ctx: ChartContext = useMemo(
    () => ({ trainNo: params.trainNo, boardingStation: params.boardingStation, composition }),
    [params.trainNo, params.boardingStation, composition],
  );

  const [tab, setTab] = useState<"vacant" | "coach">("vacant");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [chartType, setChartType] = useState<1 | 2>(hasChartTwo ? 2 : 1);
  const [vacant, setVacant] = useState<Record<string, VacantBerthResponse>>({});
  const [vacantLoading, setVacantLoading] = useState(false);
  const [vacantError, setVacantError] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<CoachDetail | null>(null);
  const [coachData, setCoachData] = useState<Record<string, CoachComposition>>({});
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);
  const [journey, setJourney] = useState<JourneyFilter>({ from: params.boardingStation, to: "", enabled: false });

  const vacantReq = useRef(0);
  const coachReq = useRef(0);

  // Keep the journey filter valid once the route is known.
  useEffect(() => {
    if (stations.length < 2) return;
    setJourney((j) => {
      const fi = idx.get(j.from);
      const from = fi !== undefined && fi < stations.length - 1 ? j.from : idx.has(params.boardingStation) ? params.boardingStation : stations[0].code;
      const ti = idx.get(j.to);
      const to = ti !== undefined && ti > (idx.get(from) ?? 0) ? j.to : stations[stations.length - 1].code;
      return from === j.from && to === j.to ? j : { ...j, from, to };
    });
  }, [stations, idx, params.boardingStation]);

  const loadVacant = useCallback(
    async (cls: string, type: 1 | 2, force = false) => {
      const key = `${cls}|${type}`;
      const token = ++vacantReq.current;
      if (!force && vacant[key]) {
        setVacantLoading(false);
        setVacantError(null);
        return;
      }
      setVacantLoading(true);
      setVacantError(null);
      try {
        const res = await getVacantBerths(ctx, cls, type, settings);
        setVacant((v) => ({ ...v, [key]: res }));
        if (token === vacantReq.current) setVacantLoading(false);
      } catch (e) {
        if (token !== vacantReq.current) return;
        setVacantError(errorMessage(e));
        setVacantLoading(false);
        if (e instanceof ConnectionError && e.needsSetup) onConnectionProblem();
      }
    },
    [ctx, settings, vacant, onConnectionProblem],
  );

  const loadCoach = useCallback(
    async (coach: CoachDetail, force = false) => {
      const token = ++coachReq.current;
      if (!force && coachData[coach.coachName]) {
        setCoachLoading(false);
        setCoachError(null);
        return;
      }
      setCoachLoading(true);
      setCoachError(null);
      try {
        const res = await getCoachComposition(ctx, coach.coachName, coach.classCode, settings);
        setCoachData((d) => ({ ...d, [coach.coachName]: res }));
        if (token === coachReq.current) setCoachLoading(false);
      } catch (e) {
        if (token !== coachReq.current) return;
        setCoachError(errorMessage(e));
        setCoachLoading(false);
        if (e instanceof ConnectionError && e.needsSetup) onConnectionProblem();
      }
    },
    [ctx, settings, coachData, onConnectionProblem],
  );

  // On first render and whenever a refreshed composition arrives: reset caches
  // and (re)load the current selections. Default to the best class.
  const selRef = useRef({ cls: selectedClass, coach: selectedCoach, chartType });
  selRef.current = { cls: selectedClass, coach: selectedCoach, chartType };
  useEffect(() => {
    setVacant({});
    setCoachData({});
    const best = [...classRows].sort((a, b) => b.vacant - a.vacant)[0];
    const cls = selRef.current.cls ?? (best && best.vacant > 0 ? best.cls : classRows[0]?.cls) ?? null;
    if (cls) {
      setSelectedClass(cls);
      void loadVacant(cls, selRef.current.chartType, true);
    }
    if (selRef.current.coach) void loadCoach(selRef.current.coach, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composition]);

  const selectClass = (cls: string) => {
    setSelectedClass(cls);
    setTab("vacant");
    void loadVacant(cls, chartType);
  };

  const changeChartType = (t: 1 | 2) => {
    setChartType(t);
    if (selectedClass) void loadVacant(selectedClass, t);
  };

  const selectCoach = (c: CoachDetail) => {
    setSelectedCoach(c);
    setTab("coach");
    void loadCoach(c);
  };

  const openCoachByName = (name: string) => {
    const c = cdd.find((x) => x.coachName === name);
    if (c) selectCoach(c);
  };

  const vacantKey = selectedClass ? `${selectedClass}|${chartType}` : "";

  return (
    <div className="space-y-5">
      <ChartSummary composition={composition} params={params} stations={stationMap} isDemo={isDemo} onRefresh={onRefresh} refreshing={refreshing} />

      {!cdd.length ? (
        <Alert tone="warning" title="No coach data returned">
          IRCTC returned no coach composition for this train/date. The chart may not be prepared yet — first charts are
          usually prepared about 4 hours before departure from the charting station.
        </Alert>
      ) : (
        <>
          <Card className="p-4 sm:p-5">
            <SectionTitle
              icon={<Rows3 className="h-5 w-5" />}
              title="Class-wise vacancy"
              subtitle={hasChartTwo ? "Berths vacant for the full journey · second chart prepared" : "Berths vacant for the full journey (first chart)"}
            />
            <div className="mt-4">
              <ClassSummary rows={classRows} selected={selectedClass} onSelect={selectClass} />
            </div>
          </Card>

          <Card className="p-4 sm:p-5">
            <SectionTitle
              icon={<TrainTrack className="h-5 w-5" />}
              title="Train composition"
              subtitle={`${cdd.length} reserved coaches in order from the engine`}
            />
            <div className="mt-4">
              <CoachStrip cdd={cdd} selectedCoach={selectedCoach?.coachName ?? null} highlightClass={tab === "vacant" ? selectedClass : null} onSelect={selectCoach} />
            </div>
          </Card>

          {stations.length > 1 && <JourneyBar stations={stations} journey={journey} onChange={setJourney} />}

          <Card className="overflow-hidden">
            <div className="flex border-b border-slate-100 bg-slate-50/60 px-2 pt-2">
              {[
                { id: "vacant" as const, label: "Vacant berths", icon: <BedDouble className="h-4 w-4" />, extra: selectedClass },
                { id: "coach" as const, label: "Coach layout", icon: <LayoutGrid className="h-4 w-4" />, extra: selectedCoach?.coachName },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "relative flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-bold transition",
                    tab === t.id ? "bg-white text-[#1b2a6b] shadow-[0_-1px_0_0_#e2e8f0,1px_0_0_0_#e2e8f0,-1px_0_0_0_#e2e8f0]" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {t.icon}
                  {t.label}
                  {t.extra && <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-extrabold text-orange-700">{t.extra}</span>}
                  {tab === t.id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-orange-500" />}
                </button>
              ))}
            </div>
            <div className="p-4 sm:p-5">
              {tab === "vacant" ? (
                <VacantBerths
                  cls={selectedClass}
                  chartType={chartType}
                  hasChartTwo={hasChartTwo}
                  onChartType={changeChartType}
                  data={vacantKey ? vacant[vacantKey] : undefined}
                  loading={vacantLoading}
                  error={vacantError}
                  onRetry={() => selectedClass && loadVacant(selectedClass, chartType, true)}
                  stations={stations}
                  stationMap={stationMap}
                  idx={idx}
                  journey={journey}
                  trainNo={params.trainNo}
                  onOpenCoach={openCoachByName}
                />
              ) : (
                <CoachLayout
                  key={selectedCoach?.coachName ?? "none"}
                  coach={selectedCoach}
                  data={selectedCoach ? coachData[selectedCoach.coachName] : undefined}
                  loading={coachLoading}
                  error={coachError}
                  onRetry={() => selectedCoach && loadCoach(selectedCoach, true)}
                  stations={stations}
                  stationMap={stationMap}
                  idx={idx}
                  journey={journey}
                  chartTwo={hasChartTwo}
                />
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
