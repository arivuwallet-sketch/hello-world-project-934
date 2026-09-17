/**
 * Module 129 — UDS negative response intelligence.
 *
 * NRC meanings come only from the documented ISO 14229-1 code list carried here
 * with its source. An unlisted code stays NRC DESCRIPTION UNAVAILABLE.
 */
import type { DatasetProvenance } from "./provenance";

export const NRC_SOURCE: DatasetProvenance = {
  sourceName: "ISO 14229-1 negative response code list (publicly documented values)",
  sourceUrl: "https://en.wikipedia.org/wiki/Unified_Diagnostic_Services",
  license: "Documented public reference — verify against your ISO 14229-1 copy",
  importedAt: "2026-01-01T00:00:00.000Z",
  classification: "STANDARD",
};

/** Widely documented NRC values only. No entry is invented for unlisted codes. */
export const NRC_DESCRIPTIONS: Record<number, string> = {
  0x10: "General reject",
  0x11: "Service not supported",
  0x12: "Sub-function not supported",
  0x13: "Incorrect message length or invalid format",
  0x14: "Response too long",
  0x21: "Busy — repeat request",
  0x22: "Conditions not correct",
  0x24: "Request sequence error",
  0x25: "No response from sub-net component",
  0x26: "Failure prevents execution of requested action",
  0x31: "Request out of range",
  0x33: "Security access denied",
  0x35: "Invalid key",
  0x36: "Exceeded number of attempts",
  0x37: "Required time delay not expired",
  0x70: "Upload/download not accepted",
  0x71: "Transfer data suspended",
  0x72: "General programming failure",
  0x73: "Wrong block sequence counter",
  0x78: "Request correctly received — response pending",
  0x7e: "Sub-function not supported in active session",
  0x7f: "Service not supported in active session",
  0x81: "RPM too high",
  0x82: "RPM too low",
  0x83: "Engine is running",
  0x84: "Engine is not running",
  0x85: "Engine run time too low",
  0x86: "Temperature too high",
  0x87: "Temperature too low",
  0x88: "Vehicle speed too high",
  0x89: "Vehicle speed too low",
  0x8a: "Throttle/pedal too high",
  0x8b: "Throttle/pedal too low",
  0x8c: "Transmission range not in neutral",
  0x8d: "Transmission range not in gear",
  0x8f: "Brake switch not closed",
  0x90: "Shifter lever not in park",
  0x91: "Torque converter clutch locked",
  0x92: "Voltage too high",
  0x93: "Voltage too low",
};

export type NegativeResponseClass =
  | "ECU REJECTED REQUEST"
  | "TRANSPORT FAILURE"
  | "TIMEOUT"
  | "INVALID RESPONSE"
  | "RESPONSE PENDING";

export interface NegativeResponseAnalysis {
  classification: NegativeResponseClass;
  requestService: number | null;
  nrc: number | null;
  nrcHex: string | null;
  description: string | null;
  descriptionAvailable: boolean;
  source: DatasetProvenance | null;
  raw: string;
}

const hex = (value: number) => value.toString(16).toUpperCase().padStart(2, "0");

/** Analyses a real received frame. Never guesses the meaning of an unlisted NRC. */
export function analyzeNegativeResponse(
  raw: string,
  transport: "OK" | "TIMEOUT" | "ERROR" = "OK",
): NegativeResponseAnalysis {
  const base: NegativeResponseAnalysis = {
    classification: "INVALID RESPONSE",
    requestService: null,
    nrc: null,
    nrcHex: null,
    description: null,
    descriptionAvailable: false,
    source: null,
    raw,
  };
  if (transport === "TIMEOUT") return { ...base, classification: "TIMEOUT" };
  if (transport === "ERROR") return { ...base, classification: "TRANSPORT FAILURE" };

  const bytes = (raw.match(/[0-9a-f]{2}/gi) ?? []).map((byte) => Number.parseInt(byte, 16));
  const start = bytes.indexOf(0x7f);
  if (start < 0 || bytes.length < start + 3) return base;

  const requestService = bytes[start + 1]!;
  const nrc = bytes[start + 2]!;
  const description = NRC_DESCRIPTIONS[nrc];
  return {
    classification: nrc === 0x78 ? "RESPONSE PENDING" : "ECU REJECTED REQUEST",
    requestService,
    nrc,
    nrcHex: hex(nrc),
    description: description ?? null,
    descriptionAvailable: description != null,
    source: description ? NRC_SOURCE : null,
    raw,
  };
}
