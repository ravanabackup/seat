import { SIDE_BERTH_CODES } from "./constants";
import type { BerthDetail, BerthStatus, StationOption, VacantBerth } from "./types";

export function isBerthDisabled(b: BerthDetail): boolean {
  return b.enable === false || b.enable === 0;
}

/**
 * Status of a berth, replicating the official chart app:
 *  - all segments occupied            -> FULL
 *  - some segments occupied           -> PARTIAL
 *  - none occupied                    -> VACANT (PARTIAL if any GNRS quota segment)
 *  - first segment quota "DMGD"       -> under repair
 *  - enable === false                 -> not available for this station
 */
export function berthStatus(b: BerthDetail): BerthStatus {
  if (isBerthDisabled(b)) return "NA";
  const segs = b.bsd ?? [];
  if (segs[0]?.quota === "DMGD") return "DMGD";
  let status: BerthStatus = "VACANT";
  if (segs.length > 0) {
    const occupied = segs.filter((s) => s.occupancy === true).length;
    if (occupied === segs.length) status = "FULL";
    else if (occupied > 0) status = "PARTIAL";
  }
  if (status === "VACANT" && segs.some((s) => s.quota === "GNRS")) status = "PARTIAL";
  return status;
}

export function sortedSegments(b: BerthDetail) {
  return [...(b.bsd ?? [])].sort((x, y) => x.splitNo - y.splitNo);
}

/* ------------------------------------------------------------------ */
/* Route / segment maths                                               */
/* ------------------------------------------------------------------ */

export function stationIndex(stations: StationOption[]): Map<string, number> {
  const m = new Map<string, number>();
  stations.forEach((s, i) => {
    if (!m.has(s.code)) m.set(s.code, i);
  });
  return m;
}

export interface Interval {
  from: number;
  to: number;
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.to > i.from).sort((a, b) => a.from - b.from);
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.from <= last.to) last.to = Math.max(last.to, cur.to);
    else out.push({ ...cur });
  }
  return out;
}

export function covers(intervals: Interval[], a: number, b: number): boolean {
  return mergeIntervals(intervals).some((i) => i.from <= a && i.to >= b);
}

function toInterval(from: string, to: string, idx: Map<string, number>): Interval | null {
  const f = idx.get(from);
  const t = idx.get(to);
  if (f === undefined || t === undefined) return null;
  return { from: f, to: t };
}

/** Is a coach-layout berth free for the whole of [from, to]? null = unknown. */
export function berthFreeForJourney(
  b: BerthDetail,
  idx: Map<string, number>,
  from: string,
  to: string,
): boolean | null {
  const a = idx.get(from);
  const z = idx.get(to);
  if (a === undefined || z === undefined || a >= z) return null;
  if (isBerthDisabled(b)) return false;
  const intervals: Interval[] = [];
  for (const s of b.bsd ?? []) {
    if (s.occupancy || s.quota === "DMGD") continue;
    const iv = toInterval(s.from, s.to, idx);
    if (iv) intervals.push(iv);
  }
  return covers(intervals, a, z);
}

export function berthKey(coach: string, berth: number) {
  return `${coach}#${berth}`;
}

export interface VacantBerthGroup {
  key: string;
  coachName: string;
  berthNumber: number;
  berthCode: string;
  cabinCoupe: string | null;
  cabinCoupeNo: string | null;
  segments: VacantBerth[];
}

/** Groups vacant segments by coach + berth. */
export function groupVacantBerths(vbd: VacantBerth[]): VacantBerthGroup[] {
  const map = new Map<string, VacantBerthGroup>();
  for (const v of vbd) {
    const key = berthKey(v.coachName, v.berthNumber);
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        coachName: v.coachName,
        berthNumber: v.berthNumber,
        berthCode: v.berthCode,
        cabinCoupe: v.cabinCoupe,
        cabinCoupeNo: v.cabinCoupeNo,
        segments: [],
      };
      map.set(key, g);
    }
    g.segments.push(v);
  }
  for (const g of map.values()) g.segments.sort((a, b) => a.splitNo - b.splitNo);
  return [...map.values()];
}

export function groupFreeForJourney(
  g: VacantBerthGroup,
  idx: Map<string, number>,
  from: string,
  to: string,
): boolean | null {
  const a = idx.get(from);
  const z = idx.get(to);
  if (a === undefined || z === undefined || a >= z) return null;
  const intervals = g.segments
    .map((s) => toInterval(s.from, s.to, idx))
    .filter((x): x is Interval => x !== null);
  return covers(intervals, a, z);
}

/* ------------------------------------------------------------------ */
/* Coach layout grouping                                               */
/* ------------------------------------------------------------------ */

export interface CabinGroup {
  key: string;
  label: string;
  main: BerthDetail[];
  side: BerthDetail[];
  minBerth: number;
}

export function groupByCabin(bdd: BerthDetail[]): CabinGroup[] {
  const map = new Map<string, BerthDetail[]>();
  for (const b of bdd) {
    const raw = (b.cabinCoupeNameNo ?? b.cabinCoupeNo ?? "").toString().trim();
    const key = raw || String(Math.ceil(b.berthNo / 8));
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  const groups: CabinGroup[] = [];
  for (const [key, list] of map) {
    list.sort((a, b) => a.berthNo - b.berthNo);
    const kind = list[0]?.cabinCoupe;
    const label =
      kind === "CB" ? `Cabin ${key}` : kind === "CP" ? `Coupe ${key}` : /^\d+$/.test(key) ? `Bay ${key}` : key;
    groups.push({
      key,
      label,
      main: list.filter((b) => !SIDE_BERTH_CODES.has(b.berthCode)),
      side: list.filter((b) => SIDE_BERTH_CODES.has(b.berthCode)),
      minBerth: list[0]?.berthNo ?? 0,
    });
  }
  return groups.sort((a, b) => a.minBerth - b.minBerth);
}
