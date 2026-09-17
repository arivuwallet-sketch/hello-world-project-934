/**
 * Module 112 — triggered evidence recorder.
 *
 * Triggers only fire from samples that were actually measured. The recorder
 * keeps a rolling pre-trigger ring buffer of real samples and closes a capture
 * once enough real post-trigger samples have arrived — never on a timer.
 */

export type TriggerComparison = "greater" | "less" | "changes-by" | "dtc-appears" | "dtc-clears" | "response-failure" | "connection-loss";

export interface TriggerDefinition {
  id: string;
  name: string;
  signal: string | null;
  comparison: TriggerComparison;
  threshold: number | null;
  unit: string | null;
  preSeconds: number;
  postSeconds: number;
  enabled: boolean;
}

export interface EvidenceSample {
  timestamp: number;
  signal: string;
  value: number;
  unit: string;
  ecu: string | null;
  pid: string | null;
  canId: string | null;
  rawResponse: string;
  protocol: string | null;
  quality: string;
}

export interface EvidenceCapture {
  id: string;
  triggerId: string;
  triggerName: string;
  cause: string;
  firedAt: number;
  preSamples: EvidenceSample[];
  postSamples: EvidenceSample[];
  closed: boolean;
  /** SHA-256 of the exported payload; only set once exported. */
  hash: string | null;
}

export class EvidenceRecorder {
  private ring: EvidenceSample[] = [];
  private open: EvidenceCapture[] = [];
  private lastValue = new Map<string, number>();

  constructor(private maxRing = 2000) {}

  /** Feed one real measurement. Returns any captures that just fired. */
  push(sample: EvidenceSample, triggers: TriggerDefinition[]): EvidenceCapture[] {
    this.ring.push(sample);
    if (this.ring.length > this.maxRing) this.ring.splice(0, this.ring.length - this.maxRing);

    for (const capture of this.open) {
      if (sample.timestamp <= capture.firedAt) continue;
      const trigger = triggers.find((t) => t.id === capture.triggerId);
      capture.postSamples.push(sample);
      const window = (trigger?.postSeconds ?? 0) * 1000;
      if (sample.timestamp - capture.firedAt >= window) capture.closed = true;
    }
    this.open = this.open.filter((c) => !c.closed);

    const fired: EvidenceCapture[] = [];
    for (const trigger of triggers) {
      if (!trigger.enabled || trigger.signal !== sample.signal) continue;
      const previous = this.lastValue.get(sample.signal);
      const cause = triggerCause(trigger, sample, previous);
      if (!cause) continue;
      if (this.open.some((c) => c.triggerId === trigger.id)) continue;
      const capture: EvidenceCapture = {
        id: globalThis.crypto.randomUUID(),
        triggerId: trigger.id,
        triggerName: trigger.name,
        cause,
        firedAt: sample.timestamp,
        preSamples: this.ring.filter((s) => s.timestamp >= sample.timestamp - trigger.preSeconds * 1000),
        postSamples: [],
        closed: false,
        hash: null,
      };
      this.open.push(capture);
      fired.push(capture);
    }
    this.lastValue.set(sample.signal, sample.value);
    return fired;
  }

  /** Fires an event trigger from a real non-numeric observation. */
  event(kind: "dtc-appears" | "dtc-clears" | "response-failure" | "connection-loss", detail: string, triggers: TriggerDefinition[]): EvidenceCapture[] {
    const now = Date.now();
    const fired: EvidenceCapture[] = [];
    for (const trigger of triggers.filter((t) => t.enabled && t.comparison === kind)) {
      const capture: EvidenceCapture = {
        id: globalThis.crypto.randomUUID(),
        triggerId: trigger.id,
        triggerName: trigger.name,
        cause: detail,
        firedAt: now,
        preSamples: this.ring.filter((s) => s.timestamp >= now - trigger.preSeconds * 1000),
        postSamples: [],
        closed: false,
        hash: null,
      };
      this.open.push(capture);
      fired.push(capture);
    }
    return fired;
  }

  bufferedSamples() {
    return this.ring.length;
  }

  reset() {
    this.ring = [];
    this.open = [];
    this.lastValue.clear();
  }
}

export function triggerCause(
  trigger: TriggerDefinition,
  sample: EvidenceSample,
  previous: number | undefined,
): string | null {
  if (trigger.threshold === null) return null;
  switch (trigger.comparison) {
    case "greater":
      return sample.value > trigger.threshold
        ? `${sample.signal} ${sample.value}${sample.unit} > ${trigger.threshold}${trigger.unit ?? ""}`
        : null;
    case "less":
      return sample.value < trigger.threshold
        ? `${sample.signal} ${sample.value}${sample.unit} < ${trigger.threshold}${trigger.unit ?? ""}`
        : null;
    case "changes-by":
      if (previous === undefined) return null;
      return Math.abs(sample.value - previous) >= trigger.threshold
        ? `${sample.signal} changed by ${Math.abs(sample.value - previous).toFixed(2)}${sample.unit}`
        : null;
    default:
      return null;
  }
}

export function captureToJson(capture: EvidenceCapture): string {
  return JSON.stringify(capture, null, 2);
}

export function captureToCsv(capture: EvidenceCapture): string {
  const head = "phase,timestamp,signal,value,unit,ecu,pid,canId,protocol,quality,rawResponse";
  const row = (phase: string) => (s: EvidenceSample) =>
    [
      phase,
      new Date(s.timestamp).toISOString(),
      s.signal,
      s.value,
      s.unit,
      s.ecu ?? "",
      s.pid ?? "",
      s.canId ?? "",
      s.protocol ?? "",
      s.quality,
      `"${s.rawResponse.replace(/"/g, "'")}"`,
    ].join(",");
  return [head, ...capture.preSamples.map(row("pre")), ...capture.postSamples.map(row("post"))].join("\n");
}
