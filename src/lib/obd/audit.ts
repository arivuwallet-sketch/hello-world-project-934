import { loadRecords, newId, saveRecords, sha256Hex } from "./persist";
import type { Permission, Role } from "./roles";

export interface AuditEntry {
  id: string;
  timestamp: string;
  user: string;
  role: Role;
  vehicle: string | null;
  vin: string | null;
  ecu: string | null;
  file: string | null;
  calibration: string | null;
  operation: string;
  permission: Permission | null;
  authorization: string;
  hardware: string | null;
  result: "SUCCESS" | "FAILED" | "BLOCKED" | "UNCONFIRMED";
  errors: string[];
  /** Chained hash over the previous entry — a modified record breaks the chain. */
  hash: string;
  previousHash: string | null;
}

const KEY = "obd.auditLog";
const MAX_ENTRIES = 2000;

export function loadAudit(): AuditEntry[] {
  return loadRecords<AuditEntry>(KEY);
}

function payload(entry: Omit<AuditEntry, "hash">): string {
  return JSON.stringify([
    entry.id,
    entry.timestamp,
    entry.user,
    entry.role,
    entry.vehicle,
    entry.vin,
    entry.ecu,
    entry.file,
    entry.calibration,
    entry.operation,
    entry.permission,
    entry.authorization,
    entry.hardware,
    entry.result,
    entry.errors,
    entry.previousHash,
  ]);
}

export async function appendAudit(
  input: Omit<AuditEntry, "id" | "timestamp" | "hash" | "previousHash">,
): Promise<AuditEntry> {
  const existing = loadAudit();
  const previous = existing[0] ?? null;
  const base = {
    ...input,
    id: newId(),
    timestamp: new Date().toISOString(),
    previousHash: previous ? previous.hash : null,
  };
  const hash = await sha256Hex(new TextEncoder().encode(payload(base)));
  const entry: AuditEntry = { ...base, hash };
  saveRecords(KEY, [entry, ...existing].slice(0, MAX_ENTRIES));
  return entry;
}

export type AuditIntegrity = { state: "VERIFIED" | "TAMPERED" | "EMPTY"; brokenAt: string | null };

/** Recomputes the chain; any edited or removed record surfaces as TAMPERED. */
export async function verifyAudit(entries = loadAudit()): Promise<AuditIntegrity> {
  if (entries.length === 0) return { state: "EMPTY", brokenAt: null };
  const chronological = [...entries].reverse();
  let previousHash: string | null = null;
  for (const entry of chronological) {
    if (entry.previousHash !== previousHash) return { state: "TAMPERED", brokenAt: entry.timestamp };
    const { hash: _ignored, ...rest } = entry;
    const expected = await sha256Hex(new TextEncoder().encode(payload({ ...rest, previousHash })));
    if (expected !== entry.hash) return { state: "TAMPERED", brokenAt: entry.timestamp };
    previousHash = entry.hash;
  }
  return { state: "VERIFIED", brokenAt: null };
}
