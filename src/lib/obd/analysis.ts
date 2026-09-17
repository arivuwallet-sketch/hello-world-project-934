import { loadRecords, newId, saveRecords } from "./persist";

export type VehicleHealthState =
  | "NORMAL"
  | "ATTENTION"
  | "FAULT PRESENT"
  | "INSUFFICIENT DATA"
  | "NOT SUPPORTED";

export interface HealthAssessment {
  area: string;
  state: VehicleHealthState;
  evidence: string;
}

/** Evidence-based only. No percentages, no scores. */
export function assessHealth(input: {
  connected: boolean;
  storedDtcs: string[];
  pendingDtcs: string[];
  milOn: boolean;
  readinessSupported: boolean;
  readinessIncomplete: string[];
  coolantC: number | null;
  voltage: number | null;
}): HealthAssessment[] {
  if (!input.connected) {
    return [{ area: "All systems", state: "INSUFFICIENT DATA", evidence: "OBD ADAPTER NOT CONNECTED" }];
  }
  const areas: HealthAssessment[] = [];
  areas.push(
    input.storedDtcs.length > 0 || input.milOn
      ? {
          area: "Fault codes",
          state: "FAULT PRESENT",
          evidence: `${input.storedDtcs.length} stored code(s)${input.milOn ? ", MIL commanded on" : ""}`,
        }
      : input.pendingDtcs.length > 0
        ? { area: "Fault codes", state: "ATTENTION", evidence: `${input.pendingDtcs.length} pending code(s)` }
        : { area: "Fault codes", state: "NORMAL", evidence: "No stored or pending codes reported" },
  );
  areas.push(
    !input.readinessSupported
      ? { area: "Readiness monitors", state: "NOT SUPPORTED", evidence: "Monitor status not reported by ECU" }
      : input.readinessIncomplete.length > 0
        ? { area: "Readiness monitors", state: "ATTENTION", evidence: `Incomplete: ${input.readinessIncomplete.join(", ")}` }
        : { area: "Readiness monitors", state: "NORMAL", evidence: "All supported monitors complete" },
  );
  areas.push(
    input.coolantC == null
      ? { area: "Engine temperature", state: "INSUFFICIENT DATA", evidence: "PID 05 not answered" }
      : input.coolantC > 110
        ? { area: "Engine temperature", state: "FAULT PRESENT", evidence: `${input.coolantC} °C reported` }
        : { area: "Engine temperature", state: "NORMAL", evidence: `${input.coolantC} °C reported` },
  );
  areas.push(
    input.voltage == null
      ? { area: "Electrical", state: "INSUFFICIENT DATA", evidence: "Module voltage not measurable" }
      : input.voltage < 12.0
        ? { area: "Electrical", state: "ATTENTION", evidence: `${input.voltage.toFixed(2)} V measured` }
        : { area: "Electrical", state: "NORMAL", evidence: `${input.voltage.toFixed(2)} V measured` },
  );
  return areas;
}

export type VehicleEventKind =
  | "DTC APPEARED"
  | "DTC CLEARED"
  | "TEMPERATURE THRESHOLD"
  | "VOLTAGE EVENT"
  | "CONNECTION LOST"
  | "ECU RESPONSE FAILURE"
  | "READINESS CHANGED"
  | "PERFORMANCE EVENT";

export interface VehicleEvent {
  id: string;
  kind: VehicleEventKind;
  detail: string;
  timestamp: number;
  source: string;
}

const EVENT_KEY = "obd.events";

export function loadEvents() {
  return loadRecords<VehicleEvent>(EVENT_KEY);
}

export function saveEvents(events: VehicleEvent[]) {
  saveRecords(EVENT_KEY, events.slice(0, 1000));
}

/** Events are only ever raised from a real observation passed in by the caller. */
export function recordEvent(kind: VehicleEventKind, detail: string, source: string): VehicleEvent {
  return { id: newId(), kind, detail, timestamp: Date.now(), source };
}

export interface MaintenanceItem {
  id: string;
  name: string;
  /** User-entered interval, or a properly sourced manufacturer figure. */
  intervalKm: number | null;
  intervalSource: string;
  lastServiceKm: number | null;
  lastServiceAt: number | null;
  currentOdometerKm: number | null;
}

export type MaintenanceStatus =
  | { state: "DUE"; remainingKm: number }
  | { state: "UPCOMING"; remainingKm: number }
  | { state: "OK"; remainingKm: number }
  | { state: "INSUFFICIENT DATA"; missing: string };

export function maintenanceStatus(item: MaintenanceItem): MaintenanceStatus {
  if (item.intervalKm == null) return { state: "INSUFFICIENT DATA", missing: "No interval entered or sourced" };
  if (item.lastServiceKm == null) return { state: "INSUFFICIENT DATA", missing: "No recorded last service mileage" };
  if (item.currentOdometerKm == null) return { state: "INSUFFICIENT DATA", missing: "No recorded current mileage" };
  const remaining = item.lastServiceKm + item.intervalKm - item.currentOdometerKm;
  if (remaining <= 0) return { state: "DUE", remainingKm: remaining };
  if (remaining < item.intervalKm * 0.1) return { state: "UPCOMING", remainingKm: remaining };
  return { state: "OK", remainingKm: remaining };
}

export interface AnomalyResult {
  signal: string;
  measuredValue: number;
  baseline: number;
  deviation: number;
  methodology: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  sampleCount: number;
  timestamp: number;
  anomalous: boolean;
}

/**
 * Calculated analytics — explicitly distinguished from measured values. The
 * baseline is the mean of real recorded samples; below 20 samples nothing is
 * reported.
 */
export function detectAnomaly(signal: string, samples: number[], latest: number): AnomalyResult | null {
  if (samples.length < 20) return null;
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  const sd = Math.sqrt(variance);
  const deviation = sd === 0 ? 0 : (latest - mean) / sd;
  return {
    signal,
    measuredValue: latest,
    baseline: Number(mean.toFixed(3)),
    deviation: Number(deviation.toFixed(2)),
    methodology: "Mean ± standard deviation of recorded real samples (z-score)",
    confidence: samples.length >= 200 ? "HIGH" : samples.length >= 60 ? "MEDIUM" : "LOW",
    sampleCount: samples.length,
    timestamp: Date.now(),
    anomalous: Math.abs(deviation) >= 3,
  };
}
