import { CalendarDays, Clock3, History, MapPin, Search, TrainFront, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { addDaysIso, cleanTime, formatDate, titleCase, todayIso } from "@/lib/format";
import type { RecentSearch, SearchParams, TrainListItem, TrainSchedule } from "@/lib/types";
import { cn } from "@/utils/cn";
import { Button } from "./ui";

interface Props {
  form: SearchParams;
  setForm: (f: SearchParams) => void;
  schedule: TrainSchedule | null;
  scheduleLoading: boolean;
  scheduleError: string | null;
  trainList: TrainListItem[];
  onTrainFocus: () => void;
  loading: boolean;
  onSubmit: () => void;
  recents: RecentSearch[];
  onPickRecent: (r: RecentSearch) => void;
  onClearRecents: () => void;
}

export function SearchForm({
  form,
  setForm,
  schedule,
  scheduleLoading,
  scheduleError,
  trainList,
  onTrainFocus,
  loading,
  onSubmit,
  recents,
  onPickRecent,
  onClearRecents,
}: Props) {
  const [trainText, setTrainText] = useState(form.trainNo);
  const [showList, setShowList] = useState(false);
  const [touched, setTouched] = useState(false);
  const blurTimer = useRef<number | undefined>(undefined);

  // Keep the text box in sync when the train number is changed from outside (recents, URL…)
  const [lastTrain, setLastTrain] = useState(form.trainNo);
  if (form.trainNo !== lastTrain) {
    setLastTrain(form.trainNo);
    if (form.trainNo && !trainText.trim().startsWith(form.trainNo)) setTrainText(form.trainNo);
  }

  const matches = useMemo(() => {
    const q = trainText.trim().toLowerCase();
    if (!q || !trainList.length) return [];
    const isNum = /^\d+$/.test(q);
    return trainList
      .filter((t) => (isNum ? t.trainNumber.startsWith(q) : t.trainName.toLowerCase().includes(q) || t.trainNumber.startsWith(q)))
      .slice(0, 8);
  }, [trainText, trainList]);

  const boardingOptions = schedule?.stations.slice(0, -1) ?? [];
  const today = todayIso();
  const quickDates = [
    { label: "Yesterday", value: addDaysIso(today, -1) },
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDaysIso(today, 1) },
  ];

  const trainValid = /^\d{5}$/.test(form.trainNo);
  const stationValid = /^[A-Z0-9]{1,6}$/.test(form.boardingStation);
  const canSubmit = trainValid && stationValid && !!form.jDate;

  const pickTrain = (t: TrainListItem) => {
    setTrainText(`${t.trainNumber} - ${t.trainName}`);
    setForm({ ...form, trainNo: t.trainNumber, boardingStation: "" });
    setShowList(false);
  };

  const onTrainInput = (v: string) => {
    setTrainText(v);
    setShowList(true);
    const num = v.match(/^\s*(\d{5})/)?.[1] ?? "";
    if (num !== form.trainNo) setForm({ ...form, trainNo: num, boardingStation: num ? form.boardingStation : "" });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (canSubmit) onSubmit();
      }}
      className="space-y-5"
    >
      <div className="grid gap-4 md:grid-cols-12">
        {/* Train */}
        <div className="relative md:col-span-5">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <TrainFront className="h-3.5 w-3.5" /> Train number / name
          </label>
          <div className="relative">
            <input
              value={trainText}
              onChange={(e) => onTrainInput(e.target.value)}
              onFocus={() => {
                onTrainFocus();
                setShowList(true);
              }}
              onBlur={() => {
                blurTimer.current = window.setTimeout(() => setShowList(false), 150);
              }}
              placeholder="e.g. 12951 or Rajdhani"
              inputMode="search"
              autoComplete="off"
              className={cn(
                "h-12 w-full rounded-xl border bg-white px-4 pr-10 text-base font-semibold text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:ring-4",
                touched && !trainValid
                  ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
                  : "border-slate-200 focus:border-[#1b2a6b] focus:ring-indigo-100",
              )}
            />
            {trainText && (
              <button
                type="button"
                onClick={() => {
                  setTrainText("");
                  setForm({ ...form, trainNo: "", boardingStation: "" });
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Clear train"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {showList && matches.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
              {matches.map((t) => (
                <li key={t.trainNumber}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      window.clearTimeout(blurTimer.current);
                      pickTrain(t);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-indigo-50"
                  >
                    <span className="rounded-md bg-[#1b2a6b] px-2 py-0.5 font-mono text-xs font-bold text-white">{t.trainNumber}</span>
                    <span className="truncate font-medium text-slate-700">{t.trainName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1.5 min-h-[18px] text-xs">
            {touched && !trainValid ? (
              <span className="text-rose-600">Enter a 5-digit train number.</span>
            ) : schedule && schedule.trainNumber === form.trainNo ? (
              <span className="font-medium text-emerald-700">
                {schedule.trainName ? titleCase(schedule.trainName) : "Route loaded"} · {schedule.stations.length} stops
              </span>
            ) : scheduleLoading ? (
              <span className="text-slate-500">Loading route…</span>
            ) : null}
          </div>
        </div>

        {/* Date */}
        <div className="md:col-span-3">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <CalendarDays className="h-3.5 w-3.5" /> Journey date
          </label>
          <input
            type="date"
            value={form.jDate}
            onChange={(e) => setForm({ ...form, jDate: e.target.value })}
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base font-semibold text-slate-900 outline-none focus:border-[#1b2a6b] focus:ring-4 focus:ring-indigo-100"
          />
          <div className="mt-1.5 flex gap-1.5">
            {quickDates.map((d) => (
              <button
                key={d.label}
                type="button"
                onClick={() => setForm({ ...form, jDate: d.value })}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition",
                  form.jDate === d.value ? "bg-[#1b2a6b] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Boarding station */}
        <div className="md:col-span-4">
          <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <MapPin className="h-3.5 w-3.5" /> Boarding station
          </label>
          {boardingOptions.length > 0 && schedule?.trainNumber === form.trainNo ? (
            <select
              value={form.boardingStation}
              onChange={(e) => setForm({ ...form, boardingStation: e.target.value })}
              className={cn(
                "h-12 w-full rounded-xl border bg-white px-3 text-base font-semibold text-slate-900 outline-none focus:ring-4",
                touched && !stationValid ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-[#1b2a6b] focus:ring-indigo-100",
              )}
            >
              <option value="">Select boarding station</option>
              {boardingOptions.map((s, i) => (
                <option key={`${s.code}-${i}`} value={s.code}>
                  {titleCase(s.name)} ({s.code}){cleanTime(s.departureTime) ? ` · ${s.departureTime}` : ""}
                  {Number(s.dayCount) > 1 ? ` (Day ${s.dayCount})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={form.boardingStation}
              onChange={(e) => setForm({ ...form, boardingStation: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) })}
              placeholder={scheduleLoading ? "Loading stations…" : "Station code, e.g. NDLS"}
              disabled={scheduleLoading}
              className={cn(
                "h-12 w-full rounded-xl border bg-white px-4 font-mono text-base font-bold uppercase tracking-wider text-slate-900 outline-none placeholder:font-sans placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:ring-4 disabled:bg-slate-50",
                touched && !stationValid ? "border-rose-300 focus:ring-rose-100" : "border-slate-200 focus:border-[#1b2a6b] focus:ring-indigo-100",
              )}
            />
          )}
          <div className="mt-1.5 min-h-[18px] text-xs">
            {touched && !stationValid ? (
              <span className="text-rose-600">Choose the station where you board.</span>
            ) : scheduleError && trainValid ? (
              <span className="text-amber-700" title={scheduleError}>
                Couldn't load stations — type the station code.
              </span>
            ) : form.jDate ? (
              <span className="text-slate-500">
                <Clock3 className="mr-1 inline h-3 w-3" />
                Boarding on {formatDate(form.jDate)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse items-stretch justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {recents.length > 0 && (
            <>
              <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">
                <History className="h-3.5 w-3.5" /> Recent
              </span>
              {recents.slice(0, 4).map((r) => (
                <button
                  key={`${r.trainNo}-${r.jDate}-${r.boardingStation}`}
                  type="button"
                  onClick={() => onPickRecent(r)}
                  className="max-w-[220px] truncate rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:border-[#1b2a6b]/40 hover:text-[#1b2a6b]"
                  title={`${r.trainNo} ${r.trainName ?? ""} · ${r.boardingStation} · ${r.jDate}`}
                >
                  <b className="font-mono">{r.trainNo}</b> · {r.boardingStation} · {r.jDate.slice(5).split("-").reverse().join("/")}
                </button>
              ))}
              <button type="button" onClick={onClearRecents} className="text-xs text-slate-400 hover:text-slate-600">
                Clear
              </button>
            </>
          )}
        </div>
        <Button type="submit" variant="accent" size="lg" loading={loading} className="shrink-0 sm:min-w-[200px]">
          {!loading && <Search className="h-5 w-5" />}
          Get Train Chart
        </Button>
      </div>
    </form>
  );
}
