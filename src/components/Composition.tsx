import { ChevronRight, TrainFront } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { classAccent, className, classRank, compareCoach } from "@/lib/constants";
import type { CoachDetail } from "@/lib/types";
import { cn } from "@/utils/cn";

export interface ClassRow {
  cls: string;
  coaches: number;
  vacant: number;
}

export function summarizeClasses(cdd: CoachDetail[]): ClassRow[] {
  const map = new Map<string, ClassRow>();
  for (const c of cdd) {
    const row = map.get(c.classCode) ?? { cls: c.classCode, coaches: 0, vacant: 0 };
    row.coaches += 1;
    row.vacant += c.vacantBerths ?? 0;
    map.set(c.classCode, row);
  }
  return [...map.values()].sort((a, b) => classRank(a.cls) - classRank(b.cls) || a.cls.localeCompare(b.cls));
}

export function ClassSummary({
  rows,
  selected,
  onSelect,
}: {
  rows: ClassRow[];
  selected: string | null;
  onSelect: (cls: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {rows.map((r) => {
        const a = classAccent(r.cls);
        const active = selected === r.cls;
        return (
          <button
            key={r.cls}
            onClick={() => onSelect(r.cls)}
            className={cn(
              "group relative flex flex-col rounded-2xl border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
              active ? "border-[#1b2a6b] ring-2 ring-[#1b2a6b]/20 shadow-md" : "border-slate-200",
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className={cn("rounded-lg px-2 py-0.5 font-mono text-sm font-extrabold ring-1", a.bg, a.text, a.ring)}>{r.cls}</span>
              <span className="text-[11px] font-medium text-slate-400">
                {r.coaches} coach{r.coaches > 1 ? "es" : ""}
              </span>
            </div>
            <div className="mt-2 truncate text-xs font-semibold text-slate-500">{className(r.cls)}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={cn("text-2xl font-extrabold", r.vacant > 0 ? "text-emerald-600" : "text-slate-800")}>{r.vacant}</span>
              <span className="text-[11px] leading-tight text-slate-500">vacant full journey</span>
            </div>
            <div className={cn("mt-2 flex items-center gap-1 text-xs font-bold", active ? "text-[#1b2a6b]" : "text-orange-600")}>
              Berth details <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function CoachStrip({
  cdd,
  selectedCoach,
  highlightClass,
  onSelect,
}: {
  cdd: CoachDetail[];
  selectedCoach: string | null;
  highlightClass: string | null;
  onSelect: (c: CoachDetail) => void;
}) {
  const coaches = useMemo(
    () => [...cdd].sort((a, b) => a.positionFromEngine - b.positionFromEngine || compareCoach(a.coachName, b.coachName)),
    [cdd],
  );
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedCoach || !scroller.current) return;
    const el = scroller.current.querySelector<HTMLElement>(`[data-coach="${CSS.escape(selectedCoach)}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedCoach]);

  return (
    <div ref={scroller} className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-3 pt-1">
      <div className="flex w-max items-end gap-1.5">
        <div className="flex h-[74px] w-[70px] flex-col items-center justify-center rounded-l-[28px] rounded-r-lg bg-gradient-to-b from-rose-600 to-rose-700 text-white shadow-md">
          <TrainFront className="h-6 w-6" />
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider">Engine</span>
        </div>
        {coaches.map((c) => {
          const a = classAccent(c.classCode);
          const active = selectedCoach === c.coachName;
          const dim = highlightClass && highlightClass !== c.classCode;
          return (
            <button
              key={`${c.coachName}-${c.positionFromEngine}`}
              data-coach={c.coachName}
              onClick={() => onSelect(c)}
              title={`${c.coachName} · ${className(c.classCode)} · position ${c.positionFromEngine} · ${c.vacantBerths} vacant`}
              className={cn(
                "relative flex h-[74px] w-[70px] shrink-0 flex-col items-center justify-center rounded-lg border-2 transition-all hover:-translate-y-1",
                a.bg,
                active ? "border-[#1b2a6b] shadow-lg shadow-indigo-900/20 -translate-y-1" : "border-transparent ring-1 ring-slate-200",
                dim && !active && "opacity-40",
              )}
            >
              <span className={cn("absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full", a.dot)} />
              <span className="text-[10px] font-semibold text-slate-400">#{c.positionFromEngine}</span>
              <span className="text-base font-extrabold leading-tight text-slate-900">{c.coachName}</span>
              <span className={cn("text-[10px] font-bold", a.text)}>{c.classCode}</span>
              <span
                className={cn(
                  "absolute -right-1 -top-2 min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold shadow-sm",
                  c.vacantBerths > 0 ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600",
                )}
              >
                {c.vacantBerths}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">n</span> berths vacant for the full journey
        </span>
        <span>Tap a coach to see its berth layout</span>
      </div>
    </div>
  );
}
