/**
 * Module 119 — OEM coverage + licensing engine.
 *
 * Coverage is never asserted by this application. Every entry originates from an
 * imported, sourced coverage dataset with complete provenance. Without an entry the
 * answer is DATA UNAVAILABLE — never "all vehicles" and never "full OEM coverage".
 */
import { loadRecords, saveRecords } from "./persist";
import { validateProvenance, type DatasetProvenance } from "./provenance";

export const COVERAGE_STATES = [
  "AVAILABLE",
  "AVAILABLE WITH HARDWARE",
  "READ ONLY",
  "WRITE SUPPORTED",
  "VEHICLE DEPENDENT",
  "ECU DEPENDENT",
  "OEM DEPENDENT",
  "AUTHORIZATION REQUIRED",
  "UNSUPPORTED",
  "DATA UNAVAILABLE",
  "NOT VERIFIED",
] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const COVERAGE_FUNCTIONS = [
  "DTC READ",
  "LIVE DATA",
  "FREEZE FRAME",
  "READ IDENTIFIERS",
  "ACTIVE TEST",
  "SERVICE FUNCTION",
  "CODING",
  "ADAPTATION",
  "CALIBRATION",
  "PROGRAMMING",
] as const;
export type CoverageFunction = (typeof COVERAGE_FUNCTIONS)[number];

export interface CoverageCapability {
  function: CoverageFunction;
  state: CoverageState;
  /** Documented evidence for this claim — required; an empty string is rejected. */
  evidence: string;
  hardwareRequirement: string | null;
}

export interface CoverageEntry {
  id: string;
  manufacturer: string;
  make: string;
  model: string;
  generation: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  market: string | null;
  engine: string | null;
  transmission: string | null;
  fuelType: string | null;
  electrification: string | null;
  ecu: string;
  system: string;
  protocol: string | null;
  diagnosticServices: string[];
  capabilities: CoverageCapability[];
  provenance: DatasetProvenance;
}

const KEY = "obd.coverage";

export function loadCoverage(): CoverageEntry[] {
  return loadRecords<CoverageEntry>(KEY);
}

export function saveCoverage(entries: CoverageEntry[]) {
  saveRecords(KEY, entries);
}

export function validateCoverageEntry(value: unknown): value is CoverageEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CoverageEntry>;
  if (!entry.make?.trim() || !entry.model?.trim() || !entry.ecu?.trim() || !entry.system?.trim()) {
    return false;
  }
  if (!validateProvenance(entry.provenance)) return false;
  if (!Array.isArray(entry.capabilities) || entry.capabilities.length === 0) return false;
  return entry.capabilities.every(
    (capability) =>
      COVERAGE_FUNCTIONS.includes(capability?.function) &&
      COVERAGE_STATES.includes(capability?.state) &&
      typeof capability?.evidence === "string" &&
      capability.evidence.trim().length > 0,
  );
}

export interface CoverageImportResult {
  accepted: CoverageEntry[];
  rejected: { index: number; reason: string }[];
}

/** Imports a coverage dataset. Entries without evidence or provenance are rejected, never repaired. */
export function importCoverage(text: string, provenance: DatasetProvenance): CoverageImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { accepted: [], rejected: [{ index: -1, reason: "MALFORMED JSON" }] };
  }
  const rows = Array.isArray(parsed) ? parsed : (parsed as { entries?: unknown[] })?.entries;
  if (!Array.isArray(rows) || rows.length === 0) {
    return { accepted: [], rejected: [{ index: -1, reason: "NO COVERAGE ENTRIES IN FILE" }] };
  }
  const accepted: CoverageEntry[] = [];
  const rejected: CoverageImportResult["rejected"] = [];
  rows.forEach((row, index) => {
    const candidate = {
      ...(row as Record<string, unknown>),
      id: `${provenance.sourceName}:${index}`,
      provenance,
    };
    if (validateCoverageEntry(candidate)) accepted.push(candidate);
    else rejected.push({ index, reason: "INCOMPLETE COVERAGE ENTRY — EVIDENCE OR PROVENANCE MISSING" });
  });
  return { accepted, rejected };
}

export interface CoverageQuery {
  make?: string;
  model?: string;
  year?: number | null;
  market?: string;
  ecu?: string;
}

function matches(entry: CoverageEntry, query: CoverageQuery) {
  const eq = (a: string | null | undefined, b: string | undefined) =>
    !b?.trim() || (a ?? "").toLowerCase() === b.trim().toLowerCase();
  if (!eq(entry.make, query.make)) return false;
  if (!eq(entry.model, query.model)) return false;
  if (!eq(entry.market, query.market)) return false;
  if (!eq(entry.ecu, query.ecu)) return false;
  if (query.year != null) {
    if (entry.yearFrom != null && query.year < entry.yearFrom) return false;
    if (entry.yearTo != null && query.year > entry.yearTo) return false;
  }
  return true;
}

export function queryCoverage(query: CoverageQuery, entries = loadCoverage()): CoverageEntry[] {
  return entries.filter((entry) => matches(entry, query));
}

/** Resolves one function for one query. Absent data stays DATA UNAVAILABLE. */
export function capabilityState(
  fn: CoverageFunction,
  query: CoverageQuery,
  entries = loadCoverage(),
): CoverageCapability {
  for (const entry of queryCoverage(query, entries)) {
    const capability = entry.capabilities.find((item) => item.function === fn);
    if (capability) return capability;
  }
  return { function: fn, state: "DATA UNAVAILABLE", evidence: "No imported coverage entry matches this vehicle", hardwareRequirement: null };
}

export function coverageMark(state: CoverageState): "✓" | "?" | "✗" | "—" {
  if (state === "AVAILABLE" || state === "AVAILABLE WITH HARDWARE" || state === "READ ONLY" || state === "WRITE SUPPORTED") return "✓";
  if (state === "UNSUPPORTED") return "✗";
  if (state === "DATA UNAVAILABLE") return "—";
  return "?";
}

/** Scope statements are only ever derived from imported entries. */
export function coverageScopeStatement(entries = loadCoverage()): string {
  if (entries.length === 0) return "NO COVERAGE DATA IMPORTED";
  const makes = new Set(entries.map((entry) => entry.make.toLowerCase()));
  return `${entries.length} imported coverage entries across ${makes.size} make(s) — scope limited to imported data`;
}
