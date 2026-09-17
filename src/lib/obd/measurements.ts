/**
 * Module 125 — real external measurement integration.
 *
 * Measurements come from a connected instrument, a recorded capture, or explicit
 * operator entry. Categories are never mixed and a value is never generated.
 */
import { loadRecords, newId, saveRecords } from "./persist";

export const INSTRUMENT_KINDS = [
  "MULTIMETER",
  "OSCILLOSCOPE",
  "PRESSURE SENSOR",
  "CURRENT CLAMP",
  "BATTERY ANALYZER",
  "TPMS TOOL",
  "THERMAL DEVICE",
  "POWER ANALYZER",
  "DYNAMOMETER",
  "OTHER DOCUMENTED INTERFACE",
] as const;
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

export const MEASUREMENT_CATEGORIES = [
  "ECU REPORTED",
  "EXTERNAL INSTRUMENT",
  "USER ENTERED",
  "CALCULATED",
  "HISTORICAL",
] as const;
export type MeasurementCategory = (typeof MEASUREMENT_CATEGORIES)[number];

export type MeasurementQuality = "GOOD" | "MARGINAL" | "OUT OF RANGE" | "UNVERIFIED";

export interface Measurement {
  id: string;
  name: string;
  value: number;
  unit: string;
  category: MeasurementCategory;
  source: string;
  device: string | null;
  instrument: InstrumentKind | null;
  timestamp: string;
  sampleRateHz: number | null;
  channel: string | null;
  quality: MeasurementQuality;
  sessionId: string | null;
  technician: string;
}

const KEY = "obd.measurements";

export function loadMeasurements(): Measurement[] {
  return loadRecords<Measurement>(KEY);
}

export type MeasurementInput = Omit<Measurement, "id" | "timestamp">;

export function recordMeasurement(input: MeasurementInput): { ok: true; measurement: Measurement } | { ok: false; reason: string } {
  if (!input.name.trim()) return { ok: false, reason: "MEASUREMENT NAME REQUIRED" };
  if (!Number.isFinite(input.value)) return { ok: false, reason: "NO VALID MEASURED VALUE" };
  if (!input.unit.trim()) return { ok: false, reason: "UNIT REQUIRED" };
  if (!input.source.trim()) return { ok: false, reason: "SOURCE REQUIRED" };
  if (input.category === "EXTERNAL INSTRUMENT" && !input.device?.trim()) {
    return { ok: false, reason: "EXTERNAL INSTRUMENT REQUIRES A DEVICE IDENTITY" };
  }
  const measurement: Measurement = { ...input, id: newId(), timestamp: new Date().toISOString() };
  saveRecords(KEY, [measurement, ...loadMeasurements()].slice(0, 5000));
  return { ok: true, measurement };
}

export function deleteMeasurement(id: string) {
  saveRecords(KEY, loadMeasurements().filter((item) => item.id !== id));
}

/** Groups by category so that instrument and ECU values are never presented as one series. */
export function groupByCategory(measurements: Measurement[]) {
  return MEASUREMENT_CATEGORIES.map((category) => ({
    category,
    items: measurements.filter((item) => item.category === category),
  }));
}

/** No instrument interface is claimed until a real driver reports it. */
export interface InstrumentInterface {
  kind: InstrumentKind;
  state: "NOT CONNECTED" | "CONNECTED" | "UNSUPPORTED BY BROWSER" | "REQUIRES LOCAL AGENT";
  device: string | null;
  evidence: string | null;
}

export function instrumentInterfaces(agentCapabilities: string[] | null): InstrumentInterface[] {
  return INSTRUMENT_KINDS.map((kind) => {
    if (agentCapabilities == null) {
      return { kind, state: "REQUIRES LOCAL AGENT" as const, device: null, evidence: null };
    }
    const match = agentCapabilities.find((capability) => capability.toUpperCase().includes(kind.split(" ")[0]!));
    return match
      ? { kind, state: "CONNECTED" as const, device: match, evidence: `Local agent capability: ${match}` }
      : { kind, state: "NOT CONNECTED" as const, device: null, evidence: null };
  });
}
