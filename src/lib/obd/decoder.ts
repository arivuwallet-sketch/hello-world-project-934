import type { PidDef } from "./pids";
import { extractPayload, isNegative } from "./elm327";

export type SignalQuality = "GOOD" | "INVALID" | "STALE";

export interface DecodedSignal {
  value: number;
  unit: string;
  mode: number;
  pid: string;
  ecu: string | null;
  canId: string | null;
  rawResponse: string;
  timestamp: number;
  latencyMs: number;
  quality: SignalQuality;
  sourceName: string;
  sourceUrl: string;
  formula: string;
}

export function decodeMode01Signal(
  definition: PidDef,
  rawResponse: string,
  latencyMs: number,
  timestamp = Date.now(),
): DecodedSignal {
  if (isNegative(rawResponse)) throw new Error("DATA NOT AVAILABLE");
  const payload = extractPayload(rawResponse, 1, definition.pid);
  if (!payload) throw new Error("INVALID RESPONSE: mode or PID echo missing");
  if (payload.length < definition.bytes) throw new Error("INVALID RESPONSE: payload is too short");
  const value = definition.decode(payload.slice(0, definition.bytes));
  if (!Number.isFinite(value) || value < definition.min || value > definition.max) {
    throw new Error("INVALID RESPONSE: decoded value is outside the declared range");
  }
  return {
    value,
    unit: definition.unit,
    mode: 1,
    pid: definition.pid,
    ecu: null,
    canId: null,
    rawResponse,
    timestamp,
    latencyMs,
    quality: "GOOD",
    sourceName: "Built-in SAE J1979 formulas",
    sourceUrl: "https://www.sae.org/standards/content/j1979_202505/",
    formula: definition.formula,
  };
}

export function signalAge(reading: DecodedSignal, now = Date.now()) {
  return Math.max(0, now - reading.timestamp);
}

export function signalQuality(reading: DecodedSignal, staleAfterMs: number, now = Date.now()): SignalQuality {
  return signalAge(reading, now) > staleAfterMs ? "STALE" : reading.quality;
}