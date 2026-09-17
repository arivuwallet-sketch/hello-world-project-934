/**
 * Module 122 — before / after repair comparison.
 *
 * Comparison only ever reports what two real scans contain. A code that vanished
 * is NOT REPORTED, never "fixed"; a cleared code is only CLEARED when a real
 * clear operation was recorded between the two scans.
 */
import type { DiagSession } from "./diag-sessions";

export type DtcVerdict =
  | "DTC CLEARED"
  | "DTC NOT REPORTED"
  | "DTC STILL PRESENT"
  | "NEW DTC REPORTED"
  | "VERIFICATION NOT AVAILABLE";

export interface DtcComparison {
  code: string;
  kind: "stored" | "pending" | "permanent";
  before: "PRESENT" | "NOT REPORTED";
  after: "PRESENT" | "NOT REPORTED" | "UNAVAILABLE";
  verdict: DtcVerdict;
}

export interface FieldComparison {
  label: string;
  before: string | null;
  after: string | null;
  changed: boolean | null;
}

export interface RepairComparison {
  beforeSessionId: string;
  afterSessionId: string;
  beforeAt: string;
  afterAt: string;
  clearRecorded: boolean;
  dtcs: DtcComparison[];
  fields: FieldComparison[];
  notes: string;
}

function present(session: DiagSession, code: string, kind: DtcComparison["kind"]) {
  return session.dtcs.some((item) => item.code === code && item.kind === kind);
}

function field(label: string, before: string | null, after: string | null): FieldComparison {
  return {
    label,
    before,
    after,
    changed: before == null || after == null ? null : before !== after,
  };
}

export function compareRepair(
  before: DiagSession,
  after: DiagSession | null,
  options: { clearRecorded?: boolean; notes?: string } = {},
): RepairComparison {
  const clearRecorded = options.clearRecorded === true;
  const codes = new Map<string, DtcComparison["kind"]>();
  for (const item of before.dtcs) codes.set(`${item.kind}:${item.code}`, item.kind);
  for (const item of after?.dtcs ?? []) codes.set(`${item.kind}:${item.code}`, item.kind);

  const dtcs: DtcComparison[] = [...codes.entries()].map(([key, kind]) => {
    const code = key.slice(key.indexOf(":") + 1);
    const wasPresent = present(before, code, kind);
    if (!after) {
      return {
        code,
        kind,
        before: wasPresent ? "PRESENT" : "NOT REPORTED",
        after: "UNAVAILABLE",
        verdict: "VERIFICATION NOT AVAILABLE",
      };
    }
    const isPresent = present(after, code, kind);
    let verdict: DtcVerdict;
    if (wasPresent && isPresent) verdict = "DTC STILL PRESENT";
    else if (wasPresent && !isPresent) verdict = clearRecorded ? "DTC CLEARED" : "DTC NOT REPORTED";
    else if (!wasPresent && isPresent) verdict = "NEW DTC REPORTED";
    else verdict = "DTC NOT REPORTED";
    return {
      code,
      kind,
      before: wasPresent ? "PRESENT" : "NOT REPORTED",
      after: isPresent ? "PRESENT" : "NOT REPORTED",
      verdict,
    };
  });

  const fields: FieldComparison[] = [
    field("Scan ID", before.id, after?.id ?? null),
    field("Timestamp", before.startedAt, after?.startedAt ?? null),
    field("VIN", before.vin, after?.vin ?? null),
    field("Adapter", before.adapter, after?.adapter ?? null),
    field("Transport", before.transport, after?.transport ?? null),
    field("Protocol", before.protocol, after?.protocol ?? null),
    field("ECU topology", before.ecus.join(", ") || null, after ? after.ecus.join(", ") || null : null),
    field("ECU identifiers", before.liveDataReferences.join(", ") || null, after ? after.liveDataReferences.join(", ") || null : null),
    field("Test results", String(before.testResults.length), after ? String(after.testResults.length) : null),
    field("Service operations", String(before.serviceOperations.length), after ? String(after.serviceOperations.length) : null),
    field("Measurement evidence", String(before.measurements.length), after ? String(after.measurements.length) : null),
  ];

  return {
    beforeSessionId: before.id,
    afterSessionId: after?.id ?? "",
    beforeAt: before.startedAt,
    afterAt: after?.startedAt ?? "",
    clearRecorded,
    dtcs,
    fields,
    notes: options.notes ?? "",
  };
}
