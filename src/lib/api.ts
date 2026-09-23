/**
 * High-level client for IRCTC's online reservation chart service.
 *
 * Endpoints & payloads mirror the official web app at
 * https://www.irctc.co.in/online-charts/ :
 *   GET  /eticketing/trainList
 *   GET  /eticketing/protected/mapps1/trnscheduleenquiry/{trainNo}  (headers greq, bmirak)
 *   POST /online-charts/api/trainComposition  {trainNo, jDate, boardingStation}
 *   POST /online-charts/api/vacantBerth       {trainNo, boardingStation, remoteStation, trainSourceStation, jDate, cls, chartType}
 *   POST /online-charts/api/coachComposition  {trainNo, boardingStation, remoteStation, trainSourceStation, jDate, coach, cls}
 */
import { API_PATHS } from "./constants";
import {
  DEMO_TRAIN_LIST,
  demoCoachComposition,
  demoSchedule,
  demoTrainComposition,
  demoVacantBerths,
} from "./demo";
import { ConnectionError, IrctcError, sendRequest, type RawResponse } from "./transport";
import type {
  CoachComposition,
  SearchParams,
  Settings,
  StationOption,
  TrainComposition,
  TrainListItem,
  TrainSchedule,
  VacantBerthResponse,
} from "./types";

function parseJson<T>(raw: RawResponse, what: string): T {
  let data: unknown;
  try {
    data = JSON.parse(raw.text);
  } catch {
    if (/access denied|you don't have permission/i.test(raw.text)) {
      throw new ConnectionError(
        `IRCTC's firewall blocked the ${what} request (HTTP ${raw.status}). IRCTC blocks cloud/datacenter IPs — use the IRCTC bridge or a proxy running on your own machine.`,
      );
    }
    throw new IrctcError(`IRCTC returned an unexpected (non-JSON) response for ${what} (HTTP ${raw.status}).`);
  }
  if (raw.status >= 400) {
    const d = (data ?? {}) as Record<string, unknown>;
    const msg = d.error ?? d.errorMessage ?? d.message;
    throw new IrctcError(typeof msg === "string" && msg ? msg : `IRCTC ${what} failed with HTTP ${raw.status}.`);
  }
  return data as T;
}

function unwrapError(data: Record<string, unknown>) {
  for (const key of ["error", "errorMessage"]) {
    const v = data[key];
    if (typeof v === "string" && v.trim()) throw new IrctcError(v.trim());
  }
}

const post = (path: string, body: unknown) => ({
  path,
  method: "POST" as const,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify(body),
});

/* ------------------------------------------------------------------ */

const TRAIN_LIST_KEY = "irctc-chart-viewer:trainList";

export function parseTrainList(text: string): TrainListItem[] {
  const out: TrainListItem[] = [];
  const seen = new Set<string>();
  const re = /(\d{4,5})\s*-\s*([^",\]\n\r]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const trainNumber = m[1];
    if (seen.has(trainNumber)) continue;
    seen.add(trainNumber);
    out.push({ trainNumber, trainName: m[2].trim() });
  }
  return out;
}

export function cachedTrainList(): TrainListItem[] | null {
  try {
    const raw = localStorage.getItem(TRAIN_LIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; list: TrainListItem[] };
    if (Date.now() - parsed.at > 5 * 24 * 3600 * 1000) return null;
    return parsed.list;
  } catch {
    return null;
  }
}

export async function getTrainList(settings: Settings): Promise<TrainListItem[]> {
  if (settings.mode === "demo") return DEMO_TRAIN_LIST;
  const cached = cachedTrainList();
  if (cached?.length) return cached;
  const raw = await sendRequest({ path: API_PATHS.trainList, method: "GET", headers: { Accept: "application/json" } }, settings);
  const list = parseTrainList(raw.text);
  if (!list.length) throw new IrctcError("Could not read the IRCTC train list.");
  try {
    localStorage.setItem(TRAIN_LIST_KEY, JSON.stringify({ at: Date.now(), list }));
  } catch {
    /* ignore quota */
  }
  return list;
}

interface RawStation {
  stationCode?: string;
  stationName?: string;
  arrivalTime?: string;
  departureTime?: string;
  dayCount?: string | number;
  distance?: string | number;
}

export async function getSchedule(trainNo: string, settings: Settings): Promise<TrainSchedule> {
  if (settings.mode === "demo") return demoSchedule(trainNo);
  const raw = await sendRequest(
    {
      path: API_PATHS.schedule + encodeURIComponent(trainNo),
      method: "GET",
      headers: { Accept: "application/json", greq: String(Date.now()), bmirak: "webbm" },
    },
    settings,
  );
  const data = parseJson<Record<string, unknown>>(raw, "train schedule");
  unwrapError(data);
  const list = (data.stationList as RawStation[] | undefined) ?? [];
  const stations: StationOption[] = list
    .filter((s) => s.stationCode)
    .map((s) => ({
      code: String(s.stationCode).trim(),
      name: String(s.stationName ?? s.stationCode).trim(),
      arrivalTime: s.arrivalTime,
      departureTime: s.departureTime,
      dayCount: s.dayCount,
      distance: s.distance,
    }));
  if (!stations.length) throw new IrctcError(`No route found for train ${trainNo}.`);
  return {
    trainNumber: String(data.trainNumber ?? trainNo),
    trainName: typeof data.trainName === "string" ? data.trainName : undefined,
    stationFrom: typeof data.stationFrom === "string" ? data.stationFrom : undefined,
    stationTo: typeof data.stationTo === "string" ? data.stationTo : undefined,
    stations,
  };
}

export async function getTrainComposition(p: SearchParams, settings: Settings): Promise<TrainComposition> {
  if (settings.mode === "demo") return demoTrainComposition(p.trainNo, p.jDate, p.boardingStation);
  const raw = await sendRequest(
    post(API_PATHS.trainComposition, { trainNo: p.trainNo, jDate: p.jDate, boardingStation: p.boardingStation }),
    settings,
  );
  const data = parseJson<TrainComposition>(raw, "train composition");
  unwrapError(data as unknown as Record<string, unknown>);
  return data;
}

export interface ChartContext {
  trainNo: string;
  boardingStation: string;
  composition: TrainComposition;
}

function chartBase(ctx: ChartContext) {
  // These values must come from the trainComposition response (as the official app does).
  return {
    trainNo: ctx.trainNo,
    boardingStation: ctx.boardingStation,
    remoteStation: ctx.composition.remote ?? ctx.boardingStation,
    trainSourceStation: ctx.composition.from ?? ctx.boardingStation,
    jDate: ctx.composition.trainStartDate,
  };
}

export async function getVacantBerths(
  ctx: ChartContext,
  cls: string,
  chartType: 1 | 2,
  settings: Settings,
): Promise<VacantBerthResponse> {
  if (settings.mode === "demo") return demoVacantBerths(ctx.composition.trainStartDate ?? "", cls);
  // chartType must be a number – the backend rejects "1" as a string.
  const raw = await sendRequest(post(API_PATHS.vacantBerth, { ...chartBase(ctx), cls, chartType }), settings);
  const data = parseJson<VacantBerthResponse>(raw, "vacant berth");
  unwrapError(data as unknown as Record<string, unknown>);
  return { vbd: data.vbd ?? [], error: null };
}

export async function getCoachComposition(
  ctx: ChartContext,
  coach: string,
  cls: string,
  settings: Settings,
): Promise<CoachComposition> {
  if (settings.mode === "demo") return demoCoachComposition(ctx.composition.trainStartDate ?? "", coach);
  const raw = await sendRequest(post(API_PATHS.coachComposition, { ...chartBase(ctx), coach, cls }), settings);
  const data = parseJson<CoachComposition>(raw, "coach layout");
  unwrapError(data as unknown as Record<string, unknown>);
  return { ...data, bdd: data.bdd ?? [] };
}
