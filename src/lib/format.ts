import type { StationOption } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return toIso(dt);
}

export function isValidIso(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(new Date(iso).getTime());
}

/** "2026-09-23" -> "Wed, 23 Sep 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2026-08-26 07:00:55" -> "26 Aug 2026, 07:00" */
export function formatDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!match) return s;
  const [, y, m, d, hh, mm] = match;
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}, ${hh}:${mm}`;
}

export function stationName(code: string | null | undefined, stations: Map<string, StationOption>): string {
  if (!code) return "—";
  const s = stations.get(code);
  return s ? titleCase(s.name) : code;
}

export function stationLabel(code: string | null | undefined, stations: Map<string, StationOption>): string {
  if (!code) return "—";
  const s = stations.get(code);
  return s ? `${titleCase(s.name)} (${code})` : code;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Jn|Jn\.)\b/g, "Jn")
    .trim();
}

export function cleanTime(t?: string): string {
  if (!t || t === "--" || t === "-") return "";
  return t;
}
