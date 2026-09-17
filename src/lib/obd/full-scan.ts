/**
 * Module 109 — full vehicle scan orchestration model.
 *
 * A system row exists only when a module actually answered. Nothing is listed
 * because it is "common on this vehicle", and scan progress is the ratio of
 * real completed requests to planned requests — never a timer.
 */

export type SystemStatus =
  | "RESPONDING"
  | "NOT RESPONDING"
  | "NOT DETECTED"
  | "UNSUPPORTED BY VEHICLE"
  | "TIMEOUT"
  | "ERROR";

export interface ScanTarget {
  /** Functional/physical request header used for the probe. */
  header: string;
  system: string;
}

/**
 * Standard OBD-II / ISO 15765-4 diagnostic addresses. These are addresses we
 * probe — presence in this list is not evidence that the module exists.
 */
export const SCAN_TARGETS: ScanTarget[] = [
  { header: "7E0", system: "Engine" },
  { header: "7E1", system: "Transmission" },
  { header: "7E2", system: "Powertrain (secondary)" },
  { header: "7E3", system: "Body / BCM" },
  { header: "7E4", system: "EV battery / hybrid" },
  { header: "7E5", system: "Charging / inverter" },
  { header: "7E6", system: "ABS / ESC" },
  { header: "7E7", system: "SRS / restraints" },
  { header: "760", system: "Gateway" },
  { header: "7A0", system: "Instrument cluster" },
  { header: "7B0", system: "HVAC" },
  { header: "7C0", system: "Steering" },
  { header: "7D0", system: "ADAS" },
  { header: "7C4", system: "Parking assist" },
];

export interface SystemResult {
  header: string;
  system: string;
  status: SystemStatus;
  responseHeader: string | null;
  protocol: string | null;
  storedDtcs: string[];
  pendingDtcs: string[];
  liveData: "AVAILABLE" | "UNSUPPORTED BY ECU" | "UNKNOWN";
  vin: "AVAILABLE" | "UNSUPPORTED BY ECU" | "UNKNOWN";
  latencyMs: number | null;
  /** Raw responses kept as evidence for every claim in this row. */
  evidence: string[];
}

export interface ScanProgress {
  planned: number;
  completed: number;
  requests: number;
  responses: number;
  failures: number;
  startedAt: number | null;
  finishedAt: number | null;
  cancelled: boolean;
}

export const EMPTY_PROGRESS: ScanProgress = {
  planned: 0,
  completed: 0,
  requests: 0,
  responses: 0,
  failures: 0,
  startedAt: null,
  finishedAt: null,
  cancelled: false,
};

/** Progress is real work done, so it is undefined before any work is planned. */
export function progressPercent(p: ScanProgress): number | null {
  if (p.planned === 0) return null;
  return Math.min(100, Math.round((p.completed / p.planned) * 100));
}

export function scanDurationMs(p: ScanProgress): number | null {
  if (p.startedAt === null) return null;
  return (p.finishedAt ?? Date.now()) - p.startedAt;
}

export function newSystemResult(target: ScanTarget): SystemResult {
  return {
    header: target.header,
    system: target.system,
    status: "NOT DETECTED",
    responseHeader: null,
    protocol: null,
    storedDtcs: [],
    pendingDtcs: [],
    liveData: "UNKNOWN",
    vin: "UNKNOWN",
    latencyMs: null,
    evidence: [],
  };
}

export interface ScanSummary {
  responding: number;
  withFaults: number;
  totalStored: number;
  totalPending: number;
  probed: number;
}

export function summariseScan(results: SystemResult[]): ScanSummary {
  const responding = results.filter((r) => r.status === "RESPONDING");
  return {
    responding: responding.length,
    withFaults: responding.filter((r) => r.storedDtcs.length + r.pendingDtcs.length > 0).length,
    totalStored: responding.reduce((n, r) => n + r.storedDtcs.length, 0),
    totalPending: responding.reduce((n, r) => n + r.pendingDtcs.length, 0),
    probed: results.length,
  };
}
