/**
 * Sample data for demo mode. Everything is generated deterministically from a
 * seed so the composition, vacant-berth list and coach layouts agree with
 * each other. Clearly labelled as sample data in the UI.
 */
import { berthStatus } from "./berth";
import { addDaysIso } from "./format";
import type {
  BerthDetail,
  BerthSegment,
  CoachComposition,
  CoachDetail,
  TrainComposition,
  TrainListItem,
  TrainSchedule,
  VacantBerth,
  VacantBerthResponse,
} from "./types";
import { IrctcError } from "./transport";

export const DEMO_TRAIN = "12951";

export const DEMO_SCHEDULE: TrainSchedule = {
  trainNumber: DEMO_TRAIN,
  trainName: "MMCT TEJAS RAJ",
  stationFrom: "MMCT",
  stationTo: "NDLS",
  stations: [
    { code: "MMCT", name: "MUMBAI CENTRAL", arrivalTime: "--", departureTime: "17:00", dayCount: 1, distance: 0 },
    { code: "BVI", name: "BORIVALI", arrivalTime: "17:22", departureTime: "17:24", dayCount: 1, distance: 30 },
    { code: "ST", name: "SURAT", arrivalTime: "19:40", departureTime: "19:45", dayCount: 1, distance: 263 },
    { code: "BRC", name: "VADODARA JN", arrivalTime: "21:06", departureTime: "21:16", dayCount: 1, distance: 392 },
    { code: "RTM", name: "RATLAM JN", arrivalTime: "00:25", departureTime: "00:28", dayCount: 2, distance: 653 },
    { code: "NAD", name: "NAGDA JN", arrivalTime: "01:13", departureTime: "01:15", dayCount: 2, distance: 694 },
    { code: "KOTA", name: "KOTA JN", arrivalTime: "03:15", departureTime: "03:25", dayCount: 2, distance: 919 },
    { code: "NDLS", name: "NEW DELHI", arrivalTime: "08:32", departureTime: "--", dayCount: 2, distance: 1384 },
  ],
};

export const DEMO_TRAIN_LIST: TrainListItem[] = [{ trainNumber: DEMO_TRAIN, trainName: "MMCT TEJAS RAJ" }];

const CHART_REMOTES: Record<string, [string, string | null]> = {
  MMCT: ["MMCT", "ST"],
  BVI: ["MMCT", "ST"],
  ST: ["ST", "BRC"],
  BRC: ["BRC", "RTM"],
  RTM: ["RTM", "KOTA"],
  NAD: ["RTM", "KOTA"],
  KOTA: ["KOTA", null],
};

interface CoachSpec {
  coachName: string;
  classCode: string;
  positionFromEngine: number;
}

const COACHES: CoachSpec[] = [
  ...Array.from({ length: 11 }, (_, i) => ({ coachName: `B${i + 1}`, classCode: "3A", positionFromEngine: i + 2 })),
  { coachName: "H1", classCode: "1A", positionFromEngine: 13 },
  ...Array.from({ length: 5 }, (_, i) => ({ coachName: `A${i + 1}`, classCode: "2A", positionFromEngine: 14 + i })),
];

/* Seeded PRNG ------------------------------------------------------- */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Layout templates -------------------------------------------------- */

interface BerthTemplate {
  berthNo: number;
  berthCode: string;
  cabinCoupe: string | null;
  cabinCoupeNo: string;
  cabinCoupeNameNo: string;
}

function layoutFor(cls: string): BerthTemplate[] {
  const out: BerthTemplate[] = [];
  if (cls === "1A") {
    const plan: Array<[string, "CB" | "CP", number]> = [
      ["A", "CB", 4], ["B", "CP", 2], ["C", "CB", 4], ["D", "CP", 2],
      ["E", "CB", 4], ["F", "CP", 2], ["G", "CB", 4], ["H", "CP", 2],
    ];
    let n = 1;
    for (const [name, kind, count] of plan) {
      for (let i = 0; i < count; i++) {
        out.push({ berthNo: n++, berthCode: i % 2 === 0 ? "L" : "U", cabinCoupe: kind, cabinCoupeNo: name, cabinCoupeNameNo: name });
      }
    }
    return out;
  }
  const pattern = cls === "2A" ? ["L", "U", "L", "U", "R", "P"] : ["L", "M", "U", "L", "M", "U", "R", "P"];
  const total = cls === "2A" ? 48 : 72;
  for (let n = 1; n <= total; n++) {
    const bay = String(Math.ceil(n / pattern.length));
    out.push({ berthNo: n, berthCode: pattern[(n - 1) % pattern.length], cabinCoupe: null, cabinCoupeNo: bay, cabinCoupeNameNo: bay });
  }
  return out;
}

const QUOTAS = ["GN", "GN", "GN", "GN", "TQ", "SS", "LD", "HP", "PT"];

function buildCoach(spec: CoachSpec, trainStartDate: string): BerthDetail[] {
  const codes = DEMO_SCHEDULE.stations.map((s) => s.code);
  const last = codes.length - 1;
  const rnd = mulberry32(hash(`${spec.coachName}|${trainStartDate}`));
  const damaged = spec.coachName === "B4" ? 23 : spec.coachName === "A2" ? 11 : -1;

  return layoutFor(spec.classCode).map((t) => {
    let bsd: BerthSegment[];
    const r = rnd();
    if (t.berthNo === damaged) {
      bsd = [{ from: codes[0], to: codes[last], occupancy: false, quota: "DMGD", splitNo: 1 }];
    } else if (r < 0.6) {
      bsd = [{ from: codes[0], to: codes[last], occupancy: true, quota: QUOTAS[Math.floor(rnd() * QUOTAS.length)], splitNo: 1 }];
    } else if (r < 0.7) {
      bsd = [{ from: codes[0], to: codes[last], occupancy: false, quota: "GN", splitNo: 1 }];
    } else {
      const cuts = new Set<number>();
      const nCuts = rnd() < 0.55 ? 1 : 2;
      while (cuts.size < nCuts) cuts.add(1 + Math.floor(rnd() * (last - 1)));
      const points = [0, ...[...cuts].sort((a, b) => a - b), last];
      let occ = rnd() < 0.5;
      bsd = [];
      for (let i = 0; i < points.length - 1; i++) {
        bsd.push({
          from: codes[points[i]],
          to: codes[points[i + 1]],
          occupancy: occ,
          quota: occ ? QUOTAS[Math.floor(rnd() * QUOTAS.length)] : "GN",
          splitNo: i + 1,
        });
        occ = !occ;
      }
    }
    return { ...t, enable: true, bsd };
  });
}

function trainStartFor(jDate: string, boarding: string): string {
  const st = DEMO_SCHEDULE.stations.find((s) => s.code === boarding);
  const day = Number(st?.dayCount ?? 1);
  return addDaysIso(jDate, -(day - 1));
}

function assertDemoTrain(trainNo: string) {
  if (trainNo !== DEMO_TRAIN) {
    throw new IrctcError(
      `Sample data is only available for train ${DEMO_TRAIN} (Mumbai Central – New Delhi Tejas Rajdhani). Switch off demo mode to fetch live charts.`,
    );
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function demoSchedule(trainNo: string): Promise<TrainSchedule> {
  await delay(250);
  assertDemoTrain(trainNo);
  return DEMO_SCHEDULE;
}

export async function demoTrainComposition(trainNo: string, jDate: string, boarding: string): Promise<TrainComposition> {
  await delay(450);
  assertDemoTrain(trainNo);
  const remotes = CHART_REMOTES[boarding];
  if (!remotes) {
    throw new IrctcError(`Boarding is not allowed at ${boarding} for this train.`);
  }
  const trainStartDate = trainStartFor(jDate, boarding);
  const cdd: CoachDetail[] = COACHES.map((c) => ({
    ...c,
    vacantBerths: buildCoach(c, trainStartDate).filter((b) => berthStatus(b) === "VACANT").length,
  }));
  return {
    cdd,
    trainNo,
    trainName: "MMCT TEJAS RAJ",
    from: "MMCT",
    to: "NDLS",
    trainStartDate,
    remoteLocationChartDate: trainStartDate,
    remote: remotes[0],
    nextRemote: remotes[1],
    destinationStation: null,
    chartOneDate: `${trainStartDate} 13:00:12`,
    chartTwoDate: null,
    error: null,
    chartStatusResponseDto: { messageIndex: 1, chartOneFlag: 4, chartTwoFlag: 0, trainStartDate, remoteStationCode: remotes[0], messageType: "S" },
  };
}

export async function demoVacantBerths(trainStartDate: string, cls: string): Promise<VacantBerthResponse> {
  await delay(350);
  const vbd: VacantBerth[] = [];
  for (const spec of COACHES.filter((c) => c.classCode === cls)) {
    for (const b of buildCoach(spec, trainStartDate)) {
      for (const s of b.bsd) {
        if (s.occupancy || s.quota === "DMGD") continue;
        vbd.push({
          coachName: spec.coachName,
          cabinCoupe: b.cabinCoupe ?? null,
          cabinCoupeNo: b.cabinCoupeNo ?? null,
          berthCode: b.berthCode,
          berthNumber: b.berthNo,
          from: s.from,
          to: s.to,
          splitNo: s.splitNo,
        });
      }
    }
  }
  return { vbd, error: null };
}

export async function demoCoachComposition(trainStartDate: string, coach: string): Promise<CoachComposition> {
  await delay(300);
  const spec = COACHES.find((c) => c.coachName === coach);
  if (!spec) throw new IrctcError(`Coach ${coach} not found.`);
  return { coachName: coach, bdd: buildCoach(spec, trainStartDate), error: null };
}
