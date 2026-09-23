import { ArrowRight, CheckCircle2, Clock, ExternalLink, FileSpreadsheet, MapPin, RefreshCw, Share2, TrainFront } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/hooks/useBridgeStatus";
import { OFFICIAL_CHART_URL } from "@/lib/constants";
import { formatDate, formatDateTime, stationLabel, stationName, titleCase } from "@/lib/format";
import type { SearchParams, StationOption, TrainComposition } from "@/lib/types";
import { Button, Card, Pill } from "./ui";

export function ChartSummary({
  composition,
  params,
  stations,
  isDemo,
  onRefresh,
  refreshing,
}: {
  composition: TrainComposition;
  params: SearchParams;
  stations: Map<string, StationOption>;
  isDemo: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [shared, setShared] = useState(false);
  const coaches = composition.cdd ?? [];
  const totalVacant = coaches.reduce((s, c) => s + (c.vacantBerths ?? 0), 0);
  const chart2 = !!composition.chartTwoDate;
  const chart1 = !!composition.chartOneDate;

  const share = async () => {
    const url = `${location.origin}${location.pathname}?train=${params.trainNo}&date=${params.jDate}&from=${params.boardingStation}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Chart ${params.trainNo}`, url });
        return;
      } catch {
        /* fall through to copy */
      }
    }
    if (await copyText(url)) {
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative bg-gradient-to-br from-[#16225a] via-[#1b2a6b] to-[#2a3f9a] px-5 py-5 text-white sm:px-6">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-orange-400/20 blur-2xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2.5 py-1 font-mono text-sm font-bold">
                <TrainFront className="h-4 w-4" /> {composition.trainNo}
              </span>
              {chart2 ? (
                <Pill className="bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Second chart prepared
                </Pill>
              ) : chart1 ? (
                <Pill className="bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/40">
                  <CheckCircle2 className="h-3.5 w-3.5" /> First chart prepared
                </Pill>
              ) : (
                <Pill className="bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/40">
                  <Clock className="h-3.5 w-3.5" /> Chart status unknown
                </Pill>
              )}
              {isDemo && <Pill className="bg-orange-500 text-white">SAMPLE DATA</Pill>}
            </div>
            <h2 className="mt-2 truncate text-xl font-extrabold tracking-tight sm:text-2xl">
              {composition.trainName ? titleCase(composition.trainName) : `Train ${composition.trainNo}`}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-indigo-100">
              <span className="font-semibold">{stationName(composition.from, stations)}</span>
              <ArrowRight className="h-4 w-4 opacity-70" />
              <span className="font-semibold">{stationName(composition.to, stations)}</span>
              <span className="opacity-60">·</span>
              <span>Train starts {formatDate(composition.trainStartDate)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={onRefresh} loading={refreshing} className="bg-white/10 text-white ring-white/20 hover:bg-white/20">
              {!refreshing && <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={share} className="bg-white/10 text-white ring-white/20 hover:bg-white/20">
              <Share2 className="h-3.5 w-3.5" /> {shared ? "Link copied" : "Share"}
            </Button>
            <a
              href={OFFICIAL_CHART_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-xs font-semibold text-white ring-1 ring-white/20 hover:bg-white/20"
            >
              <ExternalLink className="h-3.5 w-3.5" /> IRCTC
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
        <Stat icon={<MapPin className="h-4 w-4" />} label="Boarding" value={stationLabel(params.boardingStation, stations)} sub={formatDate(params.jDate)} />
        <Stat label="Charting station" value={stationLabel(composition.remote, stations)} sub="Chart prepared here" />
        <Stat label="Next charting station" value={composition.nextRemote ? stationLabel(composition.nextRemote, stations) : "—"} sub="Next remote chart" />
        <Stat
          icon={<FileSpreadsheet className="h-4 w-4" />}
          label="First chart"
          value={chart1 ? formatDateTime(composition.chartOneDate) : "Not prepared"}
          sub="~4 hrs before departure"
          highlight={chart1 && !chart2}
        />
        <Stat
          icon={<FileSpreadsheet className="h-4 w-4" />}
          label="Second chart"
          value={chart2 ? formatDateTime(composition.chartTwoDate) : "Not yet"}
          sub="~30 min before departure"
          highlight={chart2}
        />
        <Stat label="Coaches · Vacant" value={`${coaches.length} · ${totalVacant}`} sub="Berths vacant full journey" />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`min-w-0 px-4 py-3.5 ${highlight ? "bg-emerald-50/60" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-bold text-slate-900" title={value}>
        {value}
      </div>
      {sub && <div className="truncate text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
