/**
 * Module 113 — DTC correlation and evidence engine.
 *
 * Correlates a real DTC with the telemetry actually recorded around it. Every
 * description carries provenance, and no interpretation is presented as a
 * verdict: the engine reports observed evidence, possible interpretations,
 * missing tests, and uncertainty.
 */

import type { Sample } from "./store";

export type DescriptionProvenance = "STANDARD" | "COMMUNITY" | "MANUFACTURER" | "USER NOTE";

export interface DtcDescription {
  provenance: DescriptionProvenance;
  text: string;
  sourceName: string;
  sourceUrl: string | null;
}

export interface CorrelationWindow {
  signal: string;
  unit: string;
  before: Sample[];
  after: Sample[];
  /** Milliseconds between the DTC timestamp and the nearest real sample. */
  timeDistanceMs: number | null;
  sampleCount: number;
  availability: "AVAILABLE" | "INSUFFICIENT DATA" | "NO DATA RECORDED";
}

export function correlateSignal(
  signal: string,
  unit: string,
  samples: Sample[] | undefined,
  eventAt: number,
  windowMs = 15_000,
): CorrelationWindow {
  const list = samples ?? [];
  const before = list.filter((s) => s.t <= eventAt && s.t >= eventAt - windowMs);
  const after = list.filter((s) => s.t > eventAt && s.t <= eventAt + windowMs);
  const nearest = list.reduce<number | null>((best, s) => {
    const d = Math.abs(s.t - eventAt);
    return best === null || d < best ? d : best;
  }, null);
  const total = before.length + after.length;
  return {
    signal,
    unit,
    before,
    after,
    timeDistanceMs: nearest,
    sampleCount: total,
    availability: total === 0 ? "NO DATA RECORDED" : total < 4 ? "INSUFFICIENT DATA" : "AVAILABLE",
  };
}

export interface EvidenceAssessment {
  observed: string[];
  interpretations: string[];
  missingTests: string[];
  recommendedNextTest: string | null;
  uncertainty: string;
  conclusion: "OBSERVED EVIDENCE ONLY" | "INSUFFICIENT DATA FOR DIAGNOSTIC CONCLUSION";
}

/**
 * Builds an assessment from real windows only. When too little was recorded the
 * conclusion is explicitly INSUFFICIENT DATA — never a component verdict.
 */
export function assessEvidence(input: {
  code: string;
  freezeFrame: { label: string; value: string }[];
  windows: CorrelationWindow[];
}): EvidenceAssessment {
  const observed: string[] = [];
  for (const value of input.freezeFrame) observed.push(`Freeze frame ${value.label}: ${value.value}`);
  for (const w of input.windows) {
    if (w.availability === "NO DATA RECORDED") continue;
    const values = [...w.before, ...w.after].map((s) => s.v);
    if (values.length === 0) continue;
    observed.push(
      `${w.signal}: ${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)} ${w.unit} across ${w.sampleCount} recorded samples`,
    );
  }

  const missingTests = input.windows
    .filter((w) => w.availability !== "AVAILABLE")
    .map((w) => `${w.signal} was not recorded densely enough around the event`);
  if (input.freezeFrame.length === 0) missingTests.push("No freeze frame was stored for this code");

  const usable = input.windows.filter((w) => w.availability === "AVAILABLE").length;
  const enough = usable >= 2 || input.freezeFrame.length > 0;

  return {
    observed,
    interpretations: enough
      ? [
          "The recorded values above are consistent with several causes; this tool does not rank them without a documented test.",
          "Compare the values against the manufacturer's specification for this engine before drawing a conclusion.",
        ]
      : [],
    missingTests,
    recommendedNextTest: enough
      ? "Perform the documented pinpoint test for this code and record the measured result on the guided diagnostics page."
      : "Record live data with the fault present, then re-run this correlation.",
    uncertainty: enough
      ? `Based on ${usable} correlated signal${usable === 1 ? "" : "s"} and ${input.freezeFrame.length} freeze-frame value${input.freezeFrame.length === 1 ? "" : "s"} — no component has been tested.`
      : "Too little real data was recorded around this event to interpret it.",
    conclusion: enough ? "OBSERVED EVIDENCE ONLY" : "INSUFFICIENT DATA FOR DIAGNOSTIC CONCLUSION",
  };
}
