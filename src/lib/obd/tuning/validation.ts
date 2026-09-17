import type { CalibrationFile } from "./calibration";
import type { ChecksumResult } from "./checksum";
import type { EcuIdentification } from "./identification";

export type ValidationStatus =
  | "VALID"
  | "WARNING"
  | "INVALID"
  | "INCOMPATIBLE"
  | "CHECKSUM ERROR"
  | "INSUFFICIENT INFORMATION";

export interface ValidationCheck {
  name: string;
  status: ValidationStatus;
  detail: string;
}

export interface ValidationReport {
  status: ValidationStatus;
  checks: ValidationCheck[];
}

const RANK: Record<ValidationStatus, number> = {
  VALID: 0,
  WARNING: 1,
  "INSUFFICIENT INFORMATION": 2,
  "CHECKSUM ERROR": 3,
  INVALID: 4,
  INCOMPATIBLE: 5,
};

function compare(name: string, expected: string | null, actual: string | null): ValidationCheck {
  if (!expected || !actual) {
    return { name, status: "INSUFFICIENT INFORMATION", detail: "Not readable from ECU or file" };
  }
  return expected === actual
    ? { name, status: "VALID", detail: actual }
    : { name, status: "INCOMPATIBLE", detail: `File ${actual} vs ECU ${expected}` };
}

export function validateCalibration(input: {
  candidate: CalibrationFile;
  original: CalibrationFile | null;
  identification: EcuIdentification | null;
  checksums: ChecksumResult[];
  mapDefinitionsAvailable: boolean;
}): ValidationReport {
  const ident = input.identification;
  const checks: ValidationCheck[] = [
    compare("ECU hardware number", ident?.fields.ecuHardwareNumber ?? null, input.candidate.hardwareNumber),
    compare("ECU software number", ident?.fields.ecuSoftwareNumber ?? null, input.candidate.softwareNumber),
    compare("Calibration ID", ident?.fields.calibrationId ?? null, input.candidate.calibrationId),
    compare("VIN association", ident?.fields.vin ?? null, input.candidate.vin),
    input.original
      ? input.original.size === input.candidate.size
        ? { name: "File size / memory layout", status: "VALID", detail: `${input.candidate.size} bytes` }
        : {
            name: "File size / memory layout",
            status: "INVALID",
            detail: `${input.candidate.size} bytes vs original ${input.original.size} bytes`,
          }
      : { name: "File size / memory layout", status: "INSUFFICIENT INFORMATION", detail: "No original backup stored" },
    input.mapDefinitionsAvailable
      ? { name: "Calibration regions", status: "VALID", detail: "Imported definitions cover this file" }
      : { name: "Calibration regions", status: "INSUFFICIENT INFORMATION", detail: "No map definitions imported" },
    ...input.checksums.map<ValidationCheck>((result) => ({
      name: `Checksum ${result.region}`,
      status: result.status === "VALID" ? "VALID" : result.status,
      detail:
        result.calculated == null
          ? "No documented algorithm for this ECU"
          : `calculated 0x${result.calculated.toString(16)} / stored 0x${(result.stored ?? 0).toString(16)}`,
    })),
  ];
  const worst = checks.reduce<ValidationStatus>(
    (acc, check) => (RANK[check.status] > RANK[acc] ? check.status : acc),
    "VALID",
  );
  return { status: worst, checks };
}
