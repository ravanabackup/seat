/**
 * Types for the IRCTC "online-charts" service.
 *
 * Shapes were taken from the official web app bundle
 * (www.irctc.co.in/online-charts/static/js/*.chunk.js) and from recorded
 * fixtures in the open-source `indian-rail-mcp` project.
 */

export interface StationOption {
  code: string;
  name: string;
  arrivalTime?: string;
  departureTime?: string;
  dayCount?: string | number;
  distance?: string | number;
}

export interface TrainListItem {
  trainNumber: string;
  trainName: string;
}

export interface TrainSchedule {
  trainNumber: string;
  trainName?: string;
  stationFrom?: string;
  stationTo?: string;
  stations: StationOption[];
}

/** One coach in the train composition ("cdd" = coach detail data). */
export interface CoachDetail {
  coachName: string;
  classCode: string;
  positionFromEngine: number;
  /** Berths vacant for the whole journey. */
  vacantBerths: number;
}

export interface ChartStatusDto {
  messageIndex?: number;
  chartOneFlag?: number;
  chartTwoFlag?: number;
  trainStartDate?: string;
  remoteStationCode?: string;
  messageType?: string;
}

export interface TrainComposition {
  cdd: CoachDetail[] | null;
  trainNo: string;
  trainName: string | null;
  from: string | null;
  to: string | null;
  trainStartDate: string | null;
  remoteLocationChartDate?: string | null;
  /** Charting (remote) station for the selected boarding point. */
  remote: string | null;
  nextRemote: string | null;
  destinationStation?: string | null;
  chartOneDate: string | null;
  chartTwoDate: string | null;
  error: string | null;
  chartStatusResponseDto?: ChartStatusDto | null;
}

/** A vacant berth segment ("vbd" = vacant berth data). */
export interface VacantBerth {
  coachName: string;
  cabinCoupe: string | null;
  cabinCoupeNo: string | null;
  berthCode: string;
  berthNumber: number;
  from: string;
  to: string;
  splitNo: number;
}

export interface VacantBerthResponse {
  vbd: VacantBerth[] | null;
  error?: string | null;
}

/** A booking segment of a berth ("bsd" = berth split data). */
export interface BerthSegment {
  from: string;
  to: string;
  occupancy: boolean;
  quota?: string | null;
  splitNo: number;
}

/** A berth in the coach layout ("bdd" = berth detail data). */
export interface BerthDetail {
  berthNo: number;
  berthCode: string;
  cabinCoupe?: string | null;
  cabinCoupeNo?: string | null;
  cabinCoupeNameNo?: string | null;
  enable?: boolean | number | null;
  bsd: BerthSegment[];
}

export interface CoachComposition {
  coachName?: string;
  bdd: BerthDetail[] | null;
  error?: string | null;
}

export type BerthStatus = "FULL" | "PARTIAL" | "VACANT" | "DMGD" | "NA";

export interface SearchParams {
  trainNo: string;
  /** yyyy-MM-dd */
  jDate: string;
  boardingStation: string;
}

export type ConnectionMode = "auto" | "bridge" | "direct" | "proxy" | "demo";

export interface Settings {
  mode: ConnectionMode;
  proxyTemplate: string;
}

export interface RecentSearch extends SearchParams {
  trainName?: string | null;
  at: number;
}

export interface JourneyFilter {
  from: string;
  to: string;
  enabled: boolean;
}
