/**
 * Module 130 — historical evidence reader.
 *
 * Historical mode is strictly read-only. No OBD, UDS, active-test, service or
 * programming command may leave this mode, and nothing is replayed to hardware.
 */
import type { DiagSession } from "./diag-sessions";

export const HISTORICAL_BLOCKED_OPERATIONS = [
  "OBD REQUEST",
  "UDS COMMAND",
  "ACTIVE TEST",
  "SERVICE FUNCTION",
  "PROGRAMMING COMMAND",
  "CLEAR DTC",
] as const;
export type HistoricalBlockedOperation = (typeof HISTORICAL_BLOCKED_OPERATIONS)[number];

export interface HistoricalGuard {
  allowed: false;
  reason: "RECORDED DATA — NOT LIVE. NO HARDWARE COMMANDS";
  operation: HistoricalBlockedOperation;
}

/** Always refuses. Historical evidence can never issue a vehicle command. */
export function guardHistoricalOperation(operation: HistoricalBlockedOperation): HistoricalGuard {
  return { allowed: false, reason: "RECORDED DATA — NOT LIVE. NO HARDWARE COMMANDS", operation };
}

export interface TimelineEvent {
  timestampMs: number;
  kind: "SESSION" | "DTC" | "TEST" | "SERVICE" | "MEASUREMENT" | "REPORT" | "AUDIT";
  label: string;
  detail: string;
}

/** Builds a timeline from what the recorded session actually stored. */
export function sessionTimeline(session: DiagSession): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const startMs = Date.parse(session.startedAt);
  if (Number.isFinite(startMs)) {
    events.push({
      timestampMs: startMs,
      kind: "SESSION",
      label: `Session ${session.state}`,
      detail: `Work order ${session.workOrderId || "—"} · technician ${session.technician || "—"}`,
    });
  }
  for (const dtc of session.dtcs) {
    events.push({
      timestampMs: startMs,
      kind: "DTC",
      label: dtc.code,
      detail: `${dtc.kind} — recorded in this session`,
    });
  }
  const push = (kind: TimelineEvent["kind"], list: string[], label: string) => {
    for (const item of list) events.push({ timestampMs: startMs, kind, label, detail: item });
  };
  push("TEST", session.testResults, "Diagnostic test");
  push("SERVICE", session.serviceOperations, "Service operation");
  push("MEASUREMENT", session.measurements, "Measurement");
  push("REPORT", session.reports, "Report");
  push("AUDIT", session.auditRecords, "Audit record");
  const endMs = session.endedAt ? Date.parse(session.endedAt) : NaN;
  if (Number.isFinite(endMs)) {
    events.push({ timestampMs: endMs, kind: "SESSION", label: "Session ended", detail: session.state });
  }
  return events.sort((a, b) => a.timestampMs - b.timestampMs);
}

export function isHistorical(session: DiagSession) {
  return session.historical || ["COMPLETED", "FAILED", "ARCHIVED"].includes(session.state);
}
