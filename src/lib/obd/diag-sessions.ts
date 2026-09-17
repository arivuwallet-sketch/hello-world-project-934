/**
 * Module 121 — professional diagnostic session lifecycle.
 *
 * A session records what actually happened. A historical session can never be
 * promoted back to a live one, and no field is filled with placeholder data.
 */
import { loadRecords, newId, saveRecords } from "./persist";

export const SESSION_STATES = [
  "CREATED",
  "CONNECTING",
  "ACTIVE",
  "PAUSED",
  "DISCONNECTED",
  "VERIFICATION",
  "COMPLETED",
  "FAILED",
  "ARCHIVED",
] as const;
export type DiagSessionState = (typeof SESSION_STATES)[number];

export interface DiagSession {
  id: string;
  workOrderId: string;
  vehicleId: string | null;
  vin: string | null;
  adapter: string | null;
  transport: string | null;
  protocol: string | null;
  technician: string;
  startedAt: string;
  endedAt: string | null;
  state: DiagSessionState;
  ecus: string[];
  dtcs: { code: string; kind: "stored" | "pending" | "permanent" }[];
  liveDataReferences: string[];
  testResults: string[];
  serviceOperations: string[];
  measurements: string[];
  reports: string[];
  auditRecords: string[];
  notes: string;
  /** Once true the session is evidence only — no vehicle commands may be issued. */
  historical: boolean;
}

const KEY = "obd.diagSessions";

const ALLOWED: Record<DiagSessionState, DiagSessionState[]> = {
  CREATED: ["CONNECTING", "FAILED", "ARCHIVED"],
  CONNECTING: ["ACTIVE", "FAILED", "DISCONNECTED"],
  ACTIVE: ["PAUSED", "DISCONNECTED", "VERIFICATION", "COMPLETED", "FAILED"],
  PAUSED: ["ACTIVE", "DISCONNECTED", "FAILED"],
  DISCONNECTED: ["CONNECTING", "COMPLETED", "FAILED", "ARCHIVED"],
  VERIFICATION: ["COMPLETED", "FAILED", "ACTIVE"],
  COMPLETED: ["ARCHIVED"],
  FAILED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function loadDiagSessions(): DiagSession[] {
  return loadRecords<DiagSession>(KEY);
}

export function saveDiagSessions(sessions: DiagSession[]) {
  saveRecords(KEY, sessions);
}

export function createDiagSession(input: {
  workOrderId: string;
  technician: string;
  vehicleId?: string | null;
  vin?: string | null;
}): DiagSession {
  const session: DiagSession = {
    id: newId(),
    workOrderId: input.workOrderId.trim(),
    vehicleId: input.vehicleId ?? null,
    vin: input.vin ?? null,
    adapter: null,
    transport: null,
    protocol: null,
    technician: input.technician.trim(),
    startedAt: new Date().toISOString(),
    endedAt: null,
    state: "CREATED",
    ecus: [],
    dtcs: [],
    liveDataReferences: [],
    testResults: [],
    serviceOperations: [],
    measurements: [],
    reports: [],
    auditRecords: [],
    notes: "",
    historical: false,
  };
  saveDiagSessions([session, ...loadDiagSessions()]);
  return session;
}

export type TransitionResult =
  | { ok: true; session: DiagSession }
  | { ok: false; reason: string };

export function transitionSession(id: string, next: DiagSessionState): TransitionResult {
  const sessions = loadDiagSessions();
  const session = sessions.find((item) => item.id === id);
  if (!session) return { ok: false, reason: "SESSION NOT FOUND" };
  if (session.historical) return { ok: false, reason: "HISTORICAL SESSION — READ ONLY" };
  if (!ALLOWED[session.state].includes(next)) {
    return { ok: false, reason: `TRANSITION NOT PERMITTED: ${session.state} → ${next}` };
  }
  const updated: DiagSession = {
    ...session,
    state: next,
    endedAt: ["COMPLETED", "FAILED", "ARCHIVED"].includes(next) ? new Date().toISOString() : session.endedAt,
    historical: next === "ARCHIVED" ? true : session.historical,
  };
  saveDiagSessions(sessions.map((item) => (item.id === id ? updated : item)));
  return { ok: true, session: updated };
}

export function updateSession(id: string, patch: Partial<DiagSession>): TransitionResult {
  const sessions = loadDiagSessions();
  const session = sessions.find((item) => item.id === id);
  if (!session) return { ok: false, reason: "SESSION NOT FOUND" };
  if (session.historical) return { ok: false, reason: "HISTORICAL SESSION — READ ONLY" };
  const { id: _ignoreId, historical: _ignoreHistorical, state: _ignoreState, ...safe } = patch;
  const updated = { ...session, ...safe };
  saveDiagSessions(sessions.map((item) => (item.id === id ? updated : item)));
  return { ok: true, session: updated };
}

export function deleteSessionRecord(id: string) {
  saveDiagSessions(loadDiagSessions().filter((item) => item.id !== id));
}

/** A historical session may never be reopened for live communication. */
export function canSendCommands(session: DiagSession): boolean {
  return !session.historical && (session.state === "ACTIVE" || session.state === "VERIFICATION");
}

export const LIFECYCLE_STEPS = [
  "WORK ORDER",
  "VEHICLE",
  "CONNECTION",
  "ADAPTER",
  "ECU DISCOVERY",
  "FULL SCAN",
  "DIAGNOSTIC TESTS",
  "REPAIRS",
  "VERIFICATION SCAN",
  "FINAL REPORT",
] as const;
