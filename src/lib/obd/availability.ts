/** The single vocabulary used across the app to describe feature availability. */
export const AVAILABILITY_LABELS = [
  "AVAILABLE",
  "AVAILABLE WITH HARDWARE",
  "READ ONLY",
  "WRITE SUPPORTED",
  "UNSUPPORTED BY ADAPTER",
  "UNSUPPORTED BY BROWSER",
  "UNSUPPORTED BY ECU",
  "VEHICLE DEPENDENT",
  "ECU DEPENDENT",
  "OEM DEPENDENT",
  "AUTHORIZATION REQUIRED",
  "NOT IMPLEMENTED",
  "DATA UNAVAILABLE",
] as const;

export type AvailabilityLabel = (typeof AVAILABILITY_LABELS)[number];

export type DisplaySource =
  | "REAL HARDWARE"
  | "REAL ECU RESPONSE"
  | "REAL DIAGNOSTIC SESSION"
  | "REAL GPS"
  | "USER INPUT"
  | "CALCULATED FROM REAL DATA"
  | "IMPORTED DEFINITION";

/**
 * Critical display validation. A value may only be rendered as vehicle data
 * when at least one real source backs it; otherwise the caller must render the
 * returned unavailable label instead of a number.
 */
export function validateDisplay(input: {
  sources: DisplaySource[];
  value: unknown;
  stale?: boolean;
}): { display: true; stale: boolean } | { display: false; label: AvailabilityLabel } {
  if (input.value == null || input.value === "") return { display: false, label: "DATA UNAVAILABLE" };
  if (input.sources.length === 0) return { display: false, label: "DATA UNAVAILABLE" };
  return { display: true, stale: Boolean(input.stale) };
}

export interface FeatureAvailability {
  feature: string;
  label: AvailabilityLabel;
  note: string;
}

export function featureMatrix(input: {
  browserSupported: boolean;
  connected: boolean;
  rawCanSupported: boolean;
  nativeBridge: boolean;
  flashAuthorized: boolean;
  datasetsImported: number;
}): FeatureAvailability[] {
  const hardware: AvailabilityLabel = !input.browserSupported
    ? "UNSUPPORTED BY BROWSER"
    : input.connected
      ? "AVAILABLE"
      : "AVAILABLE WITH HARDWARE";
  return [
    { feature: "Live data & PID discovery", label: hardware, note: "Standardised Mode 01, discovered from the ECU" },
    { feature: "Fault codes (read)", label: hardware, note: "Modes 03, 07 and 0A" },
    {
      feature: "Fault codes (clear)",
      label: input.connected ? "AUTHORIZATION REQUIRED" : "AVAILABLE WITH HARDWARE",
      note: "Requires explicit confirmation and a positive 0x44 response",
    },
    { feature: "Freeze frame", label: hardware, note: "Mode 02, missing fields stay unavailable" },
    { feature: "Readiness monitors", label: hardware, note: "Mode 01 PID 01 and Mode 06 where supported" },
    { feature: "VIN & vehicle information", label: hardware, note: "Mode 09, validated response only" },
    {
      feature: "Raw CAN monitor",
      label: !input.connected ? "AVAILABLE WITH HARDWARE" : input.rawCanSupported ? "READ ONLY" : "UNSUPPORTED BY ADAPTER",
      note: "Requires an adapter that exposes raw frames",
    },
    { feature: "UDS diagnostics", label: input.connected ? "READ ONLY" : "AVAILABLE WITH HARDWARE", note: "Read-oriented services; no security bypass" },
    { feature: "OBFCM (Mode 09 InfoType 17)", label: input.connected ? "ECU DEPENDENT" : "AVAILABLE WITH HARDWARE", note: "Post-2021 vehicles typically" },
    {
      feature: "EV diagnostics",
      label: input.datasetsImported > 0 ? "VEHICLE DEPENDENT" : "DATA UNAVAILABLE",
      note: "Needs an imported, licensed EV signal definition",
    },
    { feature: "Performance measurement", label: hardware, note: "Uses OBD speed cross-checked against GPS" },
    { feature: "Calibration reading & editing", label: input.connected ? "OEM DEPENDENT" : "AVAILABLE WITH HARDWARE", note: "Requires readable memory and a map definition" },
    {
      feature: "ECU programming",
      label: !input.nativeBridge
        ? "UNSUPPORTED BY ADAPTER"
        : input.flashAuthorized
          ? "WRITE SUPPORTED"
          : "AUTHORIZATION REQUIRED",
      note: "Requires an authorised J2534-class interface",
    },
    { feature: "Immobiliser / key bypass", label: "NOT IMPLEMENTED", note: "Deliberately out of scope" },
    { feature: "Emissions or safety defeat", label: "NOT IMPLEMENTED", note: "Deliberately out of scope" },
  ];
}
