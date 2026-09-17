/**
 * Module 126 — oscilloscope / waveform acquisition.
 *
 * All statistics are computed from real acquired samples. With no samples the
 * module reports OSCILLOSCOPE DATA UNAVAILABLE and draws nothing.
 */

export type Coupling = "DC" | "AC" | "UNKNOWN";

export interface ScopeSample {
  /** Seconds relative to the trigger point (negative = pre-trigger). */
  t: number;
  v: number;
}

export interface ScopeChannel {
  index: 1 | 2 | 3 | 4;
  label: string;
  unit: "V" | "A";
  coupling: Coupling;
  scale: number;
  sampleRateHz: number | null;
  samples: ScopeSample[];
  device: string | null;
  capturedAt: string | null;
}

export interface ScopeTrigger {
  channel: 1 | 2 | 3 | 4;
  level: number;
  edge: "RISING" | "FALLING";
  preTriggerSeconds: number;
  postTriggerSeconds: number;
}

export interface ScopeMeasurements {
  available: boolean;
  reason: string | null;
  sampleCount: number;
  min: number | null;
  peak: number | null;
  peakToPeak: number | null;
  rms: number | null;
  mean: number | null;
  periodSeconds: number | null;
  frequencyHz: number | null;
  pulseWidthSeconds: number | null;
  dutyCyclePercent: number | null;
}

const EMPTY: ScopeMeasurements = {
  available: false,
  reason: "OSCILLOSCOPE DATA UNAVAILABLE",
  sampleCount: 0,
  min: null,
  peak: null,
  peakToPeak: null,
  rms: null,
  mean: null,
  periodSeconds: null,
  frequencyHz: null,
  pulseWidthSeconds: null,
  dutyCyclePercent: null,
};

export function measureChannel(channel: ScopeChannel | null): ScopeMeasurements {
  const samples = channel?.samples ?? [];
  if (samples.length === 0) return EMPTY;
  if (samples.length < 8) {
    return { ...EMPTY, reason: "INSUFFICIENT SAMPLES FOR MEASUREMENT", sampleCount: samples.length };
  }
  const values = samples.map((sample) => sample.v);
  const min = Math.min(...values);
  const peak = Math.max(...values);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);

  // Period from real threshold crossings only; no assumed waveform shape.
  const threshold = (min + peak) / 2;
  const crossings: number[] = [];
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    if (previous.v < threshold && current.v >= threshold) crossings.push(current.t);
  }
  const periodSeconds =
    crossings.length >= 2 ? (crossings.at(-1)! - crossings[0]!) / (crossings.length - 1) : null;
  const frequencyHz = periodSeconds && periodSeconds > 0 ? 1 / periodSeconds : null;

  let highTime = 0;
  for (let index = 1; index < samples.length; index++) {
    const previous = samples[index - 1]!;
    const current = samples[index]!;
    if (previous.v >= threshold) highTime += current.t - previous.t;
  }
  const span = samples.at(-1)!.t - samples[0]!.t;
  const dutyCyclePercent = span > 0 ? (highTime / span) * 100 : null;
  const pulseWidthSeconds =
    periodSeconds != null && dutyCyclePercent != null ? (periodSeconds * dutyCyclePercent) / 100 : null;

  return {
    available: true,
    reason: null,
    sampleCount: samples.length,
    min,
    peak,
    peakToPeak: peak - min,
    rms,
    mean,
    periodSeconds,
    frequencyHz,
    pulseWidthSeconds,
    dutyCyclePercent,
  };
}

export interface CursorReading {
  aSeconds: number;
  bSeconds: number;
  deltaSeconds: number;
  aValue: number | null;
  bValue: number | null;
  deltaValue: number | null;
}

export function cursorReading(channel: ScopeChannel | null, a: number, b: number): CursorReading | null {
  if (!channel || channel.samples.length === 0) return null;
  const at = (time: number) =>
    channel.samples.reduce(
      (best, sample) => (Math.abs(sample.t - time) < Math.abs(best.t - time) ? sample : best),
      channel.samples[0]!,
    ).v;
  const aValue = at(a);
  const bValue = at(b);
  return { aSeconds: a, bSeconds: b, deltaSeconds: b - a, aValue, bValue, deltaValue: bValue - aValue };
}

export interface CorrelationEvent {
  label: string;
  kind: "RPM" | "DTC" | "CAN" | "ECU" | "DIAGNOSTIC";
  timestampMs: number;
  detail: string;
}

/** Correlates recorded events with a capture window; nothing is created to fill gaps. */
export function correlateEvents(
  captureStartMs: number | null,
  channel: ScopeChannel | null,
  events: CorrelationEvent[],
): { event: CorrelationEvent; offsetSeconds: number }[] {
  if (captureStartMs == null || !channel || channel.samples.length === 0) return [];
  const spanSeconds = channel.samples.at(-1)!.t - channel.samples[0]!.t;
  return events
    .map((event) => ({ event, offsetSeconds: (event.timestampMs - captureStartMs) / 1000 }))
    .filter((item) => item.offsetSeconds >= channel.samples[0]!.t && item.offsetSeconds <= channel.samples[0]!.t + spanSeconds);
}

/** Parses a real captured CSV (time,value per row) from a scope export. Rejects anything else. */
export function parseScopeCsv(text: string): { samples: ScopeSample[]; skipped: number } {
  const samples: ScopeSample[] = [];
  let skipped = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /[a-z]/i.test(trimmed.split(/[,;\t]/)[0] ?? "")) continue;
    const [rawTime, rawValue] = trimmed.split(/[,;\t]/);
    const t = Number(rawTime);
    const v = Number(rawValue);
    if (!Number.isFinite(t) || !Number.isFinite(v)) {
      skipped += 1;
      continue;
    }
    samples.push({ t, v });
  }
  return { samples, skipped };
}
