import type { ValidationStatus } from "./validation";

export const PROGRAMMING_STATES = [
  "IDLE",
  "CONNECTING",
  "IDENTIFYING",
  "AUTHENTICATING",
  "PREPARING",
  "READING",
  "VALIDATING",
  "ERASING",
  "PROGRAMMING",
  "VERIFYING",
  "FINALIZING",
  "RECONNECTING",
  "COMPLETE",
  "FAILED",
  "RECOVERY REQUIRED",
] as const;

export type ProgrammingState = (typeof PROGRAMMING_STATES)[number];

export interface PreflightInput {
  ecuIdentified: boolean;
  hardwareSupportsProgramming: boolean | null;
  protocolConfirmed: boolean;
  connectionStable: boolean;
  measuredVoltage: number | null;
  calibrationSelected: boolean;
  originalBackupVerified: boolean;
  validationStatus: ValidationStatus | null;
  authorizationGranted: boolean;
}

export interface PreflightCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PreflightResult {
  blocked: boolean;
  checks: PreflightCheck[];
}

export function runPreflight(input: PreflightInput): PreflightResult {
  const checks: PreflightCheck[] = [
    { name: "ECU identified", passed: input.ecuIdentified, detail: input.ecuIdentified ? "Identification read from ECU" : "ECU NOT RESPONDING / not identified" },
    {
      name: "Compatible hardware",
      passed: input.hardwareSupportsProgramming === true,
      detail:
        input.hardwareSupportsProgramming === true
          ? "Adapter reports programming capability"
          : "UNSUPPORTED BY ADAPTER — an authorised J2534-class bridge is required",
    },
    { name: "Compatible protocol", passed: input.protocolConfirmed, detail: input.protocolConfirmed ? "Protocol detected" : "PROTOCOL DETECTION FAILED" },
    { name: "Stable connection", passed: input.connectionStable, detail: input.connectionStable ? "Link stable" : "HARDWARE COMMUNICATION UNAVAILABLE" },
    {
      name: "Adequate power",
      passed: input.measuredVoltage != null && input.measuredVoltage >= 12.4,
      detail: input.measuredVoltage == null ? "DATA NOT AVAILABLE — voltage not measurable" : `${input.measuredVoltage.toFixed(2)} V measured`,
    },
    { name: "Calibration selected", passed: input.calibrationSelected, detail: input.calibrationSelected ? "Modified calibration selected" : "No calibration selected" },
    { name: "Original backup verified", passed: input.originalBackupVerified, detail: input.originalBackupVerified ? "Backup read back and compared" : "No verified original backup" },
    {
      name: "Validation & checksum",
      passed: input.validationStatus === "VALID",
      detail: input.validationStatus ?? "Not validated",
    },
    { name: "Authorization", passed: input.authorizationGranted, detail: input.authorizationGranted ? "Technician authorisation recorded" : "AUTHORIZATION REQUIRED" },
  ];
  return { blocked: checks.some((check) => !check.passed), checks };
}

export interface ProgrammingProgress {
  /** Blocks actually transferred and confirmed by the ECU. Never time-based. */
  blocksConfirmed: number;
  blocksTotal: number | null;
  bytesConfirmed: number;
  bytesTotal: number | null;
}

export type ProgrammingOutcome =
  | "PROGRAMMING SUCCESSFUL"
  | "VERIFICATION FAILED"
  | "PROGRAMMING STATUS UNCONFIRMED"
  | "PROGRAMMING FAILED"
  | "RECOVERY REQUIRED";

export function programmingOutcome(input: {
  transferConfirmed: boolean;
  transferExitPositive: boolean;
  postWriteVerification: "MATCH" | "MISMATCH" | "UNSUPPORTED BY ECU" | null;
  faults: ProgrammingFault[];
}): ProgrammingOutcome {
  if (input.faults.some((fault) => fault.recoveryRequired)) return "RECOVERY REQUIRED";
  if (!input.transferConfirmed || !input.transferExitPositive) return "PROGRAMMING FAILED";
  if (input.postWriteVerification === "MISMATCH") return "VERIFICATION FAILED";
  if (input.postWriteVerification === "MATCH") return "PROGRAMMING SUCCESSFUL";
  return "PROGRAMMING STATUS UNCONFIRMED";
}

export type ProgrammingFaultKind =
  | "CONNECTION LOST"
  | "TIMEOUT"
  | "POWER PROBLEM"
  | "ECU REJECTION"
  | "TRANSFER FAILURE"
  | "VERIFICATION MISMATCH"
  | "CAN ERROR"
  | "ISO-TP ERROR"
  | "UDS ERROR";

export interface ProgrammingFault {
  kind: ProgrammingFaultKind;
  state: ProgrammingState;
  detail: string;
  timestamp: number;
  recoveryRequired: boolean;
}

const DESTRUCTIVE_STATES: ProgrammingState[] = ["ERASING", "PROGRAMMING", "FINALIZING"];

export function classifyProgrammingFault(
  kind: ProgrammingFaultKind,
  state: ProgrammingState,
  detail: string,
): ProgrammingFault {
  return {
    kind,
    state,
    detail,
    timestamp: Date.now(),
    recoveryRequired: DESTRUCTIVE_STATES.includes(state),
  };
}
