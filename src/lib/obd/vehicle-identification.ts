/**
 * Module 120 — real vehicle identification / AutoVIN.
 *
 * A vehicle profile is built strictly from a real ECU VIN response, a validated
 * dataset resolution, or explicit user selection. Nothing is inferred: missing
 * attributes stay UNKNOWN.
 */
import { decodeVin } from "./vin";
import { queryCoverage, type CoverageEntry } from "./coverage";

export type VinOrigin =
  | "DIAGNOSTIC RESPONSE (MODE 09 PID 02)"
  | "ECU RESPONSE (UDS DID F190)"
  | "GATEWAY RESPONSE"
  | "VALIDATED DATASET"
  | "MANUAL ENTRY";

export type IdentificationState =
  | "AUTO IDENTIFIED"
  | "MANUALLY SELECTED"
  | "PARTIALLY IDENTIFIED"
  | "IDENTIFICATION UNAVAILABLE";

export type AttributeOrigin =
  | "REAL ECU RESPONSE"
  | "RESOLVED FROM VERIFIED DATASET"
  | "USER ENTERED"
  | "UNKNOWN";

export interface IdentifiedAttribute {
  label: string;
  value: string | null;
  origin: AttributeOrigin;
  evidence: string | null;
}

export interface VehicleProfile {
  state: IdentificationState;
  vin: string | null;
  vinValid: boolean;
  vinCheckDigitOk: boolean | null;
  vinOrigin: VinOrigin | null;
  rawResponse: string | null;
  timestamp: number | null;
  attributes: IdentifiedAttribute[];
  coverageMatches: CoverageEntry[];
}

const unknown = (label: string): IdentifiedAttribute => ({ label, value: null, origin: "UNKNOWN", evidence: null });

export interface IdentifyInput {
  vin: string | null;
  vinOrigin: VinOrigin | null;
  rawResponse: string | null;
  timestamp: number | null;
  /** Attributes the operator entered by hand, if any. */
  manual?: { make?: string; model?: string; year?: string; market?: string; engine?: string; transmission?: string };
}

export function identifyVehicle(input: IdentifyInput, coverage?: CoverageEntry[]): VehicleProfile {
  const manual = input.manual ?? {};
  const manualUsed = Object.values(manual).some((value) => value?.trim());
  if (!input.vin?.trim() && !manualUsed) {
    return {
      state: "IDENTIFICATION UNAVAILABLE",
      vin: null,
      vinValid: false,
      vinCheckDigitOk: null,
      vinOrigin: null,
      rawResponse: input.rawResponse ?? null,
      timestamp: input.timestamp ?? null,
      attributes: ["Make", "Model", "Model year", "Market", "Engine", "Transmission"].map(unknown),
      coverageMatches: [],
    };
  }

  const decoded = input.vin?.trim() ? decodeVin(input.vin) : null;
  const vinValid = decoded?.valid === true;
  const attributes: IdentifiedAttribute[] = [];

  const fromManual = (label: string, value: string | undefined): IdentifiedAttribute | null =>
    value?.trim() ? { label, value: value.trim(), origin: "USER ENTERED", evidence: "Operator selection" } : null;

  // Coverage datasets are the only source allowed to resolve make/model from a VIN.
  const wmiMatches = decoded && vinValid ? (coverage ?? []).filter((entry) => entry.provenance.sourceName && entry.make) : [];
  const datasetMake = wmiMatches.length === 1 ? wmiMatches[0]!.make : null;
  const datasetModel = wmiMatches.length === 1 ? wmiMatches[0]!.model : null;

  attributes.push(
    fromManual("Make", manual.make) ??
      (datasetMake
        ? { label: "Make", value: datasetMake, origin: "RESOLVED FROM VERIFIED DATASET", evidence: wmiMatches[0]!.provenance.sourceName }
        : unknown("Make")),
  );
  attributes.push(
    fromManual("Model", manual.model) ??
      (datasetModel
        ? { label: "Model", value: datasetModel, origin: "RESOLVED FROM VERIFIED DATASET", evidence: wmiMatches[0]!.provenance.sourceName }
        : unknown("Model")),
  );
  attributes.push(
    fromManual("Model year", manual.year) ??
      (decoded && vinValid && decoded.modelYear !== "Unknown"
        ? { label: "Model year", value: decoded.modelYear, origin: "REAL ECU RESPONSE", evidence: "VIN position 10" }
        : unknown("Model year")),
  );
  attributes.push(fromManual("Market", manual.market) ?? unknown("Market"));
  attributes.push(fromManual("Engine", manual.engine) ?? unknown("Engine"));
  attributes.push(fromManual("Transmission", manual.transmission) ?? unknown("Transmission"));

  const resolvedCount = attributes.filter((attribute) => attribute.value != null).length;
  const autoOrigins: VinOrigin[] = [
    "DIAGNOSTIC RESPONSE (MODE 09 PID 02)",
    "ECU RESPONSE (UDS DID F190)",
    "GATEWAY RESPONSE",
  ];
  const auto = vinValid && input.vinOrigin != null && autoOrigins.includes(input.vinOrigin);

  let state: IdentificationState;
  if (auto && resolvedCount >= 3) state = "AUTO IDENTIFIED";
  else if (!auto && manualUsed && resolvedCount >= 2) state = "MANUALLY SELECTED";
  else if (resolvedCount > 0 || vinValid) state = "PARTIALLY IDENTIFIED";
  else state = "IDENTIFICATION UNAVAILABLE";

  const make = attributes[0]?.value ?? undefined;
  const model = attributes[1]?.value ?? undefined;
  const yearValue = Number(attributes[2]?.value);

  return {
    state,
    vin: decoded?.vin ?? null,
    vinValid,
    vinCheckDigitOk: decoded?.checkDigitOk ?? null,
    vinOrigin: input.vinOrigin ?? (manualUsed ? "MANUAL ENTRY" : null),
    rawResponse: input.rawResponse ?? null,
    timestamp: input.timestamp ?? null,
    attributes,
    coverageMatches: coverage
      ? queryCoverage(
          {
            ...(make ? { make } : {}),
            ...(model ? { model } : {}),
            year: Number.isFinite(yearValue) ? yearValue : null,
          },
          coverage,
        )
      : [],
  };
}
