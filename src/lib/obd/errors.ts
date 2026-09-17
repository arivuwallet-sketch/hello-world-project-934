export const DIAGNOSTIC_ERRORS = [
  "OBD ADAPTER NOT CONNECTED",
  "HARDWARE COMMUNICATION UNAVAILABLE",
  "PERMISSION DENIED",
  "BROWSER API UNSUPPORTED",
  "LOCAL AGENT UNAVAILABLE",
  "TRANSPORT UNAVAILABLE",
  "ADAPTER INITIALIZATION FAILED",
  "PROTOCOL DETECTION FAILED",
  "VEHICLE NOT RESPONDING",
  "ECU NOT RESPONDING",
  "PID NOT SUPPORTED",
  "SIGNAL DEFINITION UNAVAILABLE",
  "DATA NOT AVAILABLE",
  "INVALID RESPONSE",
  "STALE DATA",
  "TIMEOUT",
  "CAN ERROR",
  "CAN-FD ERROR",
  "ISO-TP ERROR",
  "UDS ERROR",
  "DOIP ERROR",
  "SERVICE DEFINITION UNAVAILABLE",
  "PROGRAMMING FAILED",
  "VERIFICATION FAILED",
  "RECOVERY REQUIRED",
  "AUTHORIZATION REQUIRED",
  "UNSUPPORTED BY ADAPTER",
  "UNSUPPORTED BY ECU",
  "VEHICLE DEPENDENT",
  "OEM DEPENDENT",
  "INSUFFICIENT DATA FOR DIAGNOSTIC CONCLUSION",
] as const;

export type DiagnosticErrorCode = (typeof DIAGNOSTIC_ERRORS)[number];

export class DiagnosticError extends Error {
  constructor(
    public readonly code: DiagnosticErrorCode,
    message = code,
  ) {
    super(message);
    this.name = "DiagnosticError";
  }
}

export function classifyHardwareError(error: unknown): DiagnosticErrorCode {
  const message = error instanceof Error ? error.message : String(error);
  if (/notallowed|permission|denied/i.test(message)) return "PERMISSION DENIED";
  if (/notfound|cancel|chooser|no port selected/i.test(message)) return "TRANSPORT UNAVAILABLE";
  if (/timeout/i.test(message)) return "TIMEOUT";
  if (/can error|bus error/i.test(message)) return "CAN ERROR";
  if (/protocol/i.test(message)) return "PROTOCOL DETECTION FAILED";
  return "HARDWARE COMMUNICATION UNAVAILABLE";
}