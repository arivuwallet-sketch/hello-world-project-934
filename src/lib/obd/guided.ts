/**
 * Module 114 — guided diagnostic decision engine.
 *
 * A plan is an evidence tree. Expected observations are authored with the plan;
 * observed values are only ever entered by a technician or read from real data.
 * `applyObservation` refuses to copy an expected value into the observed slot.
 */

import { loadRecords, saveRecords, newId } from "./persist";

export type StepStatus =
  | "NOT STARTED"
  | "IN PROGRESS"
  | "WAITING FOR DATA"
  | "WAITING FOR MEASUREMENT"
  | "PASS"
  | "FAIL"
  | "INCONCLUSIVE"
  | "UNSUPPORTED"
  | "COMPLETED";

export type ObservationOrigin = "OBSERVED (LIVE DATA)" | "USER ENTERED" | "CALCULATED FROM REAL DATA";

export interface PlanStep {
  id: string;
  title: string;
  instruction: string;
  requires: "live-data" | "measurement" | "visual" | "scan-tool";
  expected: string;
  observed: string | null;
  observedOrigin: ObservationOrigin | null;
  status: StepStatus;
  notes: string;
  /** Branch labels the technician can take from this step's outcome. */
  branches: { outcome: "PASS" | "FAIL" | "INCONCLUSIVE"; next: string }[];
}

export interface DiagnosticPlan {
  id: string;
  name: string;
  sourceName: string;
  sourceUrl: string | null;
  license: string | null;
  version: string;
  applicability: string;
  prerequisites: string[];
  requiredTools: string[];
  requiredMeasurements: string[];
  safetyConditions: string[];
  steps: PlanStep[];
  conclusion: string | null;
  createdAt: number;
}

const KEY = "obd.diagnosticPlans";

export function loadPlans(): DiagnosticPlan[] {
  return loadRecords<DiagnosticPlan>(KEY);
}

export function savePlans(plans: DiagnosticPlan[]) {
  saveRecords(KEY, plans);
}

/**
 * A generic, source-cited evidence tree. It contains no manufacturer-specific
 * routine, ID or specification — those must come from an imported plan with its
 * own provenance.
 */
export function standardEvidencePlan(code: string): DiagnosticPlan {
  const step = (
    title: string,
    instruction: string,
    requires: PlanStep["requires"],
    expected: string,
  ): PlanStep => ({
    id: newId(),
    title,
    instruction,
    requires,
    expected,
    observed: null,
    observedOrigin: null,
    status: "NOT STARTED",
    notes: "",
    branches: [
      { outcome: "PASS", next: "Continue to the next step" },
      { outcome: "FAIL", next: "Stop and repair the confirmed fault, then re-verify" },
      { outcome: "INCONCLUSIVE", next: "Record what is missing and gather more real data" },
    ],
  });

  return {
    id: newId(),
    name: `Evidence tree for ${code}`,
    sourceName: "Generic OBD-II evidence workflow (this application)",
    sourceUrl: null,
    license: null,
    version: "1",
    applicability: "Any OBD-II vehicle; no manufacturer-specific values are asserted",
    prerequisites: ["Adapter connected", "Engine at the state described by the freeze frame where possible"],
    requiredTools: ["OBD-II adapter", "Multimeter for any electrical measurement"],
    requiredMeasurements: ["Live data for the parameters named by the code", "Any measurement the documented test requires"],
    safetyConditions: [
      "Never perform a road test alone while operating the scan tool",
      "Observe the manufacturer's high-voltage precautions on hybrid and electric vehicles",
    ],
    steps: [
      step("Confirm the code is still present", "Re-read stored, pending and permanent codes.", "scan-tool", "The code is reported again by the module"),
      step("Read the freeze frame", "Record every freeze-frame value the module returns.", "scan-tool", "Freeze-frame values are returned for this code"),
      step("Review live data at the freeze-frame conditions", "Record the named parameters while reproducing the stored conditions.", "live-data", "Values sit inside the manufacturer's published range"),
      step("Check related parameters", "Record the parameters that share the same circuit or subsystem.", "live-data", "Related parameters agree with each other"),
      step("Perform the documented pinpoint test", "Follow the manufacturer's documented test for this code and record the measurement.", "measurement", "The measurement matches the documented specification"),
      step("Re-verify after repair", "Clear codes, drive the documented cycle and re-read.", "scan-tool", "The code does not return and readiness completes"),
    ],
    conclusion: null,
    createdAt: Date.now(),
  };
}

/** Records an observation. Expected text is never used as the observed value. */
export function applyObservation(
  step: PlanStep,
  observed: string,
  origin: ObservationOrigin,
  status: Extract<StepStatus, "PASS" | "FAIL" | "INCONCLUSIVE" | "UNSUPPORTED">,
): PlanStep {
  const value = observed.trim();
  if (value.length === 0) {
    return { ...step, status: step.requires === "measurement" ? "WAITING FOR MEASUREMENT" : "WAITING FOR DATA" };
  }
  return { ...step, observed: value, observedOrigin: origin, status };
}

export function planConclusion(steps: PlanStep[]): string {
  if (steps.some((s) => s.status === "FAIL")) return "FAULT CONFIRMED BY A RECORDED OBSERVATION";
  const answered = steps.filter((s) => s.observed !== null);
  if (answered.length < steps.length) return "INSUFFICIENT DATA FOR DIAGNOSTIC CONCLUSION";
  if (steps.some((s) => s.status === "INCONCLUSIVE" || s.status === "UNSUPPORTED")) {
    return "INSUFFICIENT DATA FOR DIAGNOSTIC CONCLUSION";
  }
  return "ALL DOCUMENTED STEPS PASSED — no fault reproduced";
}
