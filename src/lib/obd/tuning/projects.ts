import { loadRecords, newId, saveRecords } from "../persist";
import type { CalibrationFile } from "./calibration";
import type { EcuIdentification } from "./identification";
import type { ProgrammingFault, ProgrammingOutcome, ProgrammingState } from "./programming";
import type { ValidationStatus } from "./validation";

export const PROJECT_STATUSES = [
  "NEW",
  "IDENTIFIED",
  "ORIGINAL BACKUP",
  "CALIBRATION IN PROGRESS",
  "VALIDATION",
  "READY TO PROGRAM",
  "PROGRAMMING",
  "VERIFIED",
  "FAILED",
  "RECOVERY REQUIRED",
  "ARCHIVED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type TuningLogKind =
  | "ECU"
  | "CALIBRATION"
  | "CHANGE"
  | "LIVE DATA"
  | "DTC"
  | "CONNECTION"
  | "VOLTAGE"
  | "PROGRAMMING"
  | "VERIFICATION";

export interface TuningLogEntry {
  id: string;
  kind: TuningLogKind;
  message: string;
  timestamp: number;
  state?: ProgrammingState;
}

export interface TuningProject {
  id: string;
  vehicleId: string | null;
  vehicleLabel: string;
  vin: string | null;
  status: ProjectStatus;
  identification: EcuIdentification | null;
  original: CalibrationFile | null;
  modified: CalibrationFile | null;
  revisions: CalibrationFile[];
  validationStatus: ValidationStatus | null;
  programmingOutcome: ProgrammingOutcome | null;
  faults: ProgrammingFault[];
  logs: TuningLogEntry[];
  dtcs: string[];
  technician: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

const KEY = "obd.tuningProjects";

export function loadProjects() {
  return loadRecords<TuningProject>(KEY);
}

export function saveProjects(projects: TuningProject[]) {
  saveRecords(KEY, projects);
}

export function createProject(input: {
  vehicleId: string | null;
  vehicleLabel: string;
  vin: string | null;
  technician: string;
  notes: string;
}): TuningProject {
  const now = Date.now();
  return {
    id: newId(),
    vehicleId: input.vehicleId,
    vehicleLabel: input.vehicleLabel,
    vin: input.vin,
    status: "NEW",
    identification: null,
    original: null,
    modified: null,
    revisions: [],
    validationStatus: null,
    programmingOutcome: null,
    faults: [],
    logs: [],
    dtcs: [],
    technician: input.technician,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
}

export function appendLog(project: TuningProject, kind: TuningLogKind, message: string, state?: ProgrammingState): TuningProject {
  const entry: TuningLogEntry = { id: newId(), kind, message, timestamp: Date.now(), ...(state ? { state } : {}) };
  return { ...project, logs: [entry, ...project.logs].slice(0, 500), updatedAt: entry.timestamp };
}

/** The original baseline is written once and never replaced. */
export function attachOriginal(project: TuningProject, file: CalibrationFile): TuningProject {
  if (project.original) throw new Error("Original baseline already recorded and cannot be overwritten");
  return appendLog(
    { ...project, original: file, status: "ORIGINAL BACKUP" },
    "CALIBRATION",
    `Original baseline stored — ${file.filename} (${file.hash.slice(0, 12)}…)`,
  );
}

export function attachRevision(project: TuningProject, file: CalibrationFile): TuningProject {
  return appendLog(
    {
      ...project,
      modified: file,
      revisions: [file, ...project.revisions],
      status: "CALIBRATION IN PROGRESS",
      validationStatus: null,
    },
    "CALIBRATION",
    `Revision ${file.version} r${file.revision} on branch ${file.branch} stored — ${file.filename}`,
  );
}

export function rollbackTo(project: TuningProject, revisionId: string): TuningProject {
  const target = project.revisions.find((revision) => revision.id === revisionId);
  if (!target) throw new Error("Revision not found");
  return appendLog({ ...project, modified: target, validationStatus: null }, "CHANGE", `Rolled back to ${target.version} r${target.revision}`);
}
