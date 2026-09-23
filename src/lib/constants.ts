import type { BerthStatus } from "./types";

export const IRCTC_ORIGIN = "https://www.irctc.co.in";
export const OFFICIAL_CHART_URL = "https://www.irctc.co.in/online-charts/";

export const API_PATHS = {
  trainList: "/eticketing/trainList",
  schedule: "/eticketing/protected/mapps1/trnscheduleenquiry/",
  trainComposition: "/online-charts/api/trainComposition",
  vacantBerth: "/online-charts/api/vacantBerth",
  coachComposition: "/online-charts/api/coachComposition",
} as const;

/** Class names exactly as used by the official chart app. */
export const CLASS_NAMES: Record<string, string> = {
  "1A": "First AC",
  "2A": "Second AC",
  FC: "First Class",
  "3A": "Third AC",
  CC: "AC Chair Car",
  SL: "Sleeper Class",
  "2S": "Second Sitting",
  EA: "Executive Anubhuti",
  EC: "Exec. Chair Car",
  "3E": "AC 3 Economy",
  EV: "Vistadome AC",
  VC: "Vistadome CC",
  VS: "Vistadome Non-AC",
};

/** Sort order used by the official app. */
export const CLASS_ORDER = [
  "EA", "1A", "EC", "2A", "FC", "3A", "3E", "CC", "SL", "2S", "VS", "CH", "SH", "VC", "EV",
];

export function classRank(cls: string): number {
  const i = CLASS_ORDER.indexOf(cls);
  return i === -1 ? 99 : i;
}

export const BERTH_NAMES: Record<string, string> = {
  L: "Lower Berth",
  M: "Middle Berth",
  U: "Upper Berth",
  R: "Side Lower Berth",
  D: "Side Middle Berth",
  P: "Side Upper Berth",
  W: "Window Seat",
  S: "Aisle Seat",
};

export const BERTH_SHORT: Record<string, string> = {
  L: "LB",
  M: "MB",
  U: "UB",
  R: "SL",
  D: "SM",
  P: "SU",
  W: "WS",
  S: "AS",
};

export const SIDE_BERTH_CODES = new Set(["R", "D", "P"]);

export function berthName(code: string): string {
  return BERTH_NAMES[code] ?? code;
}

export function berthShort(code: string): string {
  return BERTH_SHORT[code] ?? code;
}

export function className(cls: string): string {
  return CLASS_NAMES[cls] ?? cls;
}

/** Colours used by the official IRCTC coach layout (three.js scene). */
export const STATUS_META: Record<
  BerthStatus,
  { label: string; bg: string; border: string; text: string }
> = {
  VACANT: { label: "Vacant for full journey", bg: "#A8D08D", border: "#6fa84f", text: "#1f3d10" },
  PARTIAL: { label: "Occupied for part journey", bg: "#FFD965", border: "#d9ab1f", text: "#4a3700" },
  FULL: { label: "Occupied for full journey", bg: "#D9E2F3", border: "#9fb3d9", text: "#23355c" },
  DMGD: { label: "Under repair", bg: "#C19C8F", border: "#9a7466", text: "#3b2119" },
  NA: { label: "Not available for this station", bg: "#D6D8DB", border: "#b3b6bb", text: "#4b5563" },
};

/** Visual accent per class family for the train composition strip. */
export function classAccent(cls: string): { bg: string; ring: string; text: string; dot: string } {
  switch (cls) {
    case "1A":
    case "EA":
    case "EC":
    case "FC":
      return { bg: "bg-violet-50", ring: "ring-violet-300", text: "text-violet-800", dot: "bg-violet-500" };
    case "2A":
      return { bg: "bg-sky-50", ring: "ring-sky-300", text: "text-sky-800", dot: "bg-sky-500" };
    case "3A":
    case "3E":
      return { bg: "bg-cyan-50", ring: "ring-cyan-300", text: "text-cyan-800", dot: "bg-cyan-500" };
    case "CC":
    case "VC":
    case "EV":
      return { bg: "bg-teal-50", ring: "ring-teal-300", text: "text-teal-800", dot: "bg-teal-500" };
    case "SL":
    case "VS":
      return { bg: "bg-amber-50", ring: "ring-amber-300", text: "text-amber-800", dot: "bg-amber-500" };
    case "2S":
      return { bg: "bg-orange-50", ring: "ring-orange-300", text: "text-orange-800", dot: "bg-orange-500" };
    default:
      return { bg: "bg-slate-50", ring: "ring-slate-300", text: "text-slate-700", dot: "bg-slate-400" };
  }
}

/** Natural sort for coach names: A1 < A2 < A10 < B1. */
export function compareCoach(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}
