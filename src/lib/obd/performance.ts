import { loadRecords, newId, saveRecords } from "./persist";

export interface PerformanceSample {
  timestamp: number;
  /** km/h, only when the ECU actually answered PID 0D. */
  obdSpeed: number | null;
  /** km/h from the Geolocation API, only when the fix provides speed. */
  gpsSpeed: number | null;
  gpsAccuracyMeters: number | null;
  latitude: number | null;
  longitude: number | null;
  rpm: number | null;
  /** metres, integrated from the source actually used. */
  distance: number;
  source: "OBD" | "GPS" | "BOTH" | "NONE";
  quality: "GOOD" | "DEGRADED" | "UNUSABLE";
}

export interface SpeedComparison {
  obdSpeed: number | null;
  gpsSpeed: number | null;
  absoluteDifference: number | null;
  relativeDifference: number | null;
  gpsAccuracyMeters: number | null;
  status: "VALID" | "SPEED SOURCE MISMATCH" | "DATA NOT AVAILABLE";
}

const MISMATCH_KMH = 5;
const MISMATCH_RATIO = 0.08;

export function compareSpeeds(sample: PerformanceSample): SpeedComparison {
  const { obdSpeed, gpsSpeed, gpsAccuracyMeters } = sample;
  if (obdSpeed == null || gpsSpeed == null) {
    return { obdSpeed, gpsSpeed, absoluteDifference: null, relativeDifference: null, gpsAccuracyMeters, status: "DATA NOT AVAILABLE" };
  }
  const absolute = Math.abs(obdSpeed - gpsSpeed);
  const reference = Math.max(obdSpeed, gpsSpeed, 1);
  const relative = absolute / reference;
  return {
    obdSpeed,
    gpsSpeed,
    absoluteDifference: Number(absolute.toFixed(2)),
    relativeDifference: Number(relative.toFixed(4)),
    gpsAccuracyMeters,
    status: absolute > MISMATCH_KMH && relative > MISMATCH_RATIO ? "SPEED SOURCE MISMATCH" : "VALID",
  };
}

export const RUN_STATES = [
  "READY",
  "WAITING FOR VALID DATA",
  "ARMED",
  "START DETECTED",
  "ACCELERATION",
  "TARGET REACHED",
  "VALIDATION",
  "RESULT",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export interface RunTracker {
  state: RunState;
  samples: PerformanceSample[];
  startTimestamp: number | null;
  targetTimestamp: number | null;
}

export function createTracker(): RunTracker {
  return { state: "READY", samples: [], startTimestamp: null, targetTimestamp: null };
}

function usableSpeed(sample: PerformanceSample) {
  return sample.obdSpeed ?? sample.gpsSpeed;
}

/**
 * Advances the run purely on measured samples. There is no timer: a run only
 * moves forward when real speed data arrives.
 */
export function advanceTracker(tracker: RunTracker, sample: PerformanceSample, targetKmh: number): RunTracker {
  const speed = usableSpeed(sample);
  const next: RunTracker = { ...tracker, samples: [...tracker.samples, sample] };
  if (speed == null || sample.quality === "UNUSABLE") {
    next.state = tracker.state === "READY" ? "WAITING FOR VALID DATA" : tracker.state;
    return next;
  }
  switch (tracker.state) {
    case "READY":
    case "WAITING FOR VALID DATA":
      next.state = speed <= 1 ? "ARMED" : "WAITING FOR VALID DATA";
      return next;
    case "ARMED":
      if (speed > 1) {
        next.state = "START DETECTED";
        next.startTimestamp = sample.timestamp;
      }
      return next;
    case "START DETECTED":
      next.state = "ACCELERATION";
      return next;
    case "ACCELERATION":
      if (speed >= targetKmh) {
        next.state = "TARGET REACHED";
        next.targetTimestamp = sample.timestamp;
      }
      return next;
    case "TARGET REACHED":
      next.state = "VALIDATION";
      return next;
    case "VALIDATION":
      next.state = "RESULT";
      return next;
    default:
      return next;
  }
}

export interface RunResult {
  kind: "0-60" | "quarter-mile";
  elapsedSeconds: number | null;
  distanceMeters: number | null;
  terminalSpeedKmh: number | null;
  sampleCount: number;
  sources: string[];
  worstGpsAccuracy: number | null;
  maxSpeedDifference: number | null;
  quality: "GOOD" | "DEGRADED";
  unavailableReason: string | null;
}

const MIN_SAMPLES = 10;

export function finaliseAcceleration(tracker: RunTracker): RunResult {
  const base: RunResult = {
    kind: "0-60",
    elapsedSeconds: null,
    distanceMeters: null,
    terminalSpeedKmh: null,
    sampleCount: tracker.samples.length,
    sources: [...new Set(tracker.samples.map((sample) => sample.source))],
    worstGpsAccuracy: worstAccuracy(tracker.samples),
    maxSpeedDifference: maxDifference(tracker.samples),
    quality: "GOOD",
    unavailableReason: null,
  };
  if (tracker.startTimestamp == null || tracker.targetTimestamp == null) {
    return { ...base, unavailableReason: "RESULT UNAVAILABLE — start or target not measured" };
  }
  if (tracker.samples.length < MIN_SAMPLES) {
    return { ...base, unavailableReason: "RESULT UNAVAILABLE — insufficient samples" };
  }
  const last = tracker.samples[tracker.samples.length - 1] as PerformanceSample;
  return {
    ...base,
    elapsedSeconds: Number(((tracker.targetTimestamp - tracker.startTimestamp) / 1000).toFixed(3)),
    distanceMeters: Number(last.distance.toFixed(1)),
    terminalSpeedKmh: usableSpeed(last),
    quality: (base.worstGpsAccuracy ?? 0) > 10 ? "DEGRADED" : "GOOD",
  };
}

export function finaliseQuarterMile(tracker: RunTracker, distanceMeters = 402.336): RunResult {
  const crossing = tracker.samples.find((sample) => sample.distance >= distanceMeters);
  const result = { ...finaliseAcceleration(tracker), kind: "quarter-mile" as const };
  if (!crossing || tracker.startTimestamp == null) {
    return { ...result, elapsedSeconds: null, unavailableReason: "RESULT UNAVAILABLE — distance not covered by measured data" };
  }
  return {
    ...result,
    elapsedSeconds: Number(((crossing.timestamp - tracker.startTimestamp) / 1000).toFixed(3)),
    distanceMeters: Number(crossing.distance.toFixed(1)),
    terminalSpeedKmh: usableSpeed(crossing),
    unavailableReason: null,
  };
}

function worstAccuracy(samples: PerformanceSample[]) {
  const values = samples.map((sample) => sample.gpsAccuracyMeters).filter((value): value is number => value != null);
  return values.length ? Math.max(...values) : null;
}

function maxDifference(samples: PerformanceSample[]) {
  const values = samples
    .map((sample) => compareSpeeds(sample).absoluteDifference)
    .filter((value): value is number => value != null);
  return values.length ? Math.max(...values) : null;
}

export interface PerformanceSession {
  id: string;
  label: "HISTORICAL REAL MEASUREMENT";
  vehicleId: string | null;
  vin: string | null;
  recordedAt: number;
  result: RunResult;
  samples: PerformanceSample[];
}

const PERF_KEY = "obd.performanceSessions";

export function loadPerformanceSessions() {
  return loadRecords<PerformanceSession>(PERF_KEY);
}

export function savePerformanceSessions(sessions: PerformanceSession[]) {
  saveRecords(PERF_KEY, sessions);
}

export function recordSession(input: {
  vehicleId: string | null;
  vin: string | null;
  result: RunResult;
  samples: PerformanceSample[];
}): PerformanceSession {
  return {
    id: newId(),
    label: "HISTORICAL REAL MEASUREMENT",
    vehicleId: input.vehicleId,
    vin: input.vin,
    recordedAt: Date.now(),
    result: input.result,
    samples: input.samples,
  };
}

export interface DynoRun {
  runNumber: number;
  rows: { rpm: number; wheelPowerKw: number; torqueNm: number }[];
  environment: { temperatureC?: number; pressureHpa?: number; humidityPct?: number };
  correctionFactor: string | null;
  sourceFileName: string;
  importedAt: number;
}

/** Imports a genuine dyno CSV. Nothing is generated or interpolated. */
export function parseDynoCsv(text: string, fileName: string): DynoRun {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines.shift();
  if (!header) throw new Error("INVALID RESPONSE: empty dyno file");
  const columns = header.split(/[,;]/).map((name) => name.trim().toLowerCase());
  const rpmIndex = columns.findIndex((name) => name.includes("rpm"));
  const powerIndex = columns.findIndex((name) => name.includes("power") || name.includes("kw"));
  const torqueIndex = columns.findIndex((name) => name.includes("torque") || name.includes("nm"));
  if (rpmIndex < 0 || powerIndex < 0 || torqueIndex < 0) {
    throw new Error("INVALID RESPONSE: dyno file must contain RPM, power and torque columns");
  }
  const rows: DynoRun["rows"] = [];
  for (const line of lines) {
    const cells = line.split(/[,;]/);
    const rpm = Number(cells[rpmIndex]);
    const power = Number(cells[powerIndex]);
    const torque = Number(cells[torqueIndex]);
    if (!Number.isFinite(rpm) || !Number.isFinite(power) || !Number.isFinite(torque)) continue;
    rows.push({ rpm, wheelPowerKw: power, torqueNm: torque });
  }
  if (rows.length === 0) throw new Error("DATA NOT AVAILABLE: no usable dyno rows");
  const runColumn = columns.findIndex((name) => name.includes("run"));
  const firstRow = lines[0]?.split(/[,;]/) ?? [];
  const runNumber = runColumn >= 0 ? Number(firstRow[runColumn]) || 1 : 1;
  const correctionColumn = columns.findIndex((name) => name.includes("correction"));
  return {
    runNumber,
    rows,
    environment: {},
    correctionFactor: correctionColumn >= 0 ? (firstRow[correctionColumn]?.trim() ?? null) : null,
    sourceFileName: fileName,
    importedAt: Date.now(),
  };
}
