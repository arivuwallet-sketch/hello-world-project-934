/**
 * Module 127 — advanced CAN trace analyzer.
 *
 * Every statistic derives from frames that were actually observed. Missing frames
 * are reported as dropped-frame evidence, never reconstructed.
 */

export interface ObservedFrame {
  timestampMs: number;
  id: string;
  extended: boolean;
  dlc: number;
  data: number[];
  direction: "RX" | "TX";
  bus: string;
}

export interface CanFilter {
  id?: string;
  mask?: string;
  extended?: boolean | null;
  dlc?: number | null;
  dataByteIndex?: number | null;
  dataByteValue?: number | null;
  direction?: "RX" | "TX" | null;
  bus?: string;
  fromMs?: number | null;
  toMs?: number | null;
  signal?: string;
}

function maskMatches(id: string, filterId: string, mask?: string) {
  const value = Number.parseInt(id, 16);
  const target = Number.parseInt(filterId, 16);
  if (!Number.isFinite(value) || !Number.isFinite(target)) return false;
  if (!mask) return value === target;
  const maskValue = Number.parseInt(mask, 16);
  if (!Number.isFinite(maskValue)) return value === target;
  return (value & maskValue) === (target & maskValue);
}

export function applyCanFilter(frames: ObservedFrame[], filter: CanFilter): ObservedFrame[] {
  return frames.filter((frame) => {
    if (filter.id?.trim() && !maskMatches(frame.id, filter.id.trim(), filter.mask?.trim())) return false;
    if (filter.extended != null && frame.extended !== filter.extended) return false;
    if (filter.dlc != null && frame.dlc !== filter.dlc) return false;
    if (filter.direction != null && frame.direction !== filter.direction) return false;
    if (filter.bus?.trim() && frame.bus !== filter.bus.trim()) return false;
    if (filter.fromMs != null && frame.timestampMs < filter.fromMs) return false;
    if (filter.toMs != null && frame.timestampMs > filter.toMs) return false;
    if (filter.dataByteIndex != null && filter.dataByteValue != null) {
      if (frame.data[filter.dataByteIndex] !== filter.dataByteValue) return false;
    }
    return true;
  });
}

export interface CanIdStatistics {
  id: string;
  extended: boolean;
  dlc: number | null;
  count: number;
  firstSeenMs: number;
  lastSeenMs: number;
  averagePeriodMs: number | null;
  minPeriodMs: number | null;
  maxPeriodMs: number | null;
  jitterMs: number | null;
  frequencyHz: number | null;
  droppedFrameEvidence: string | null;
  burst: boolean;
  known: boolean;
}

export function analyzeFrames(
  frames: ObservedFrame[],
  knownIds: Set<string> = new Set(),
): CanIdStatistics[] {
  const groups = new Map<string, ObservedFrame[]>();
  for (const frame of frames) {
    const list = groups.get(frame.id) ?? [];
    list.push(frame);
    groups.set(frame.id, list);
  }

  return [...groups.entries()]
    .map(([id, list]) => {
      const sorted = [...list].sort((a, b) => a.timestampMs - b.timestampMs);
      const periods: number[] = [];
      for (let index = 1; index < sorted.length; index++) {
        periods.push(sorted[index]!.timestampMs - sorted[index - 1]!.timestampMs);
      }
      const averagePeriodMs = periods.length ? periods.reduce((a, b) => a + b, 0) / periods.length : null;
      const minPeriodMs = periods.length ? Math.min(...periods) : null;
      const maxPeriodMs = periods.length ? Math.max(...periods) : null;
      const jitterMs = minPeriodMs != null && maxPeriodMs != null ? maxPeriodMs - minPeriodMs : null;
      const dlcValues = new Set(sorted.map((frame) => frame.dlc));
      const dropped =
        averagePeriodMs != null && maxPeriodMs != null && maxPeriodMs > averagePeriodMs * 3
          ? `Gap of ${Math.round(maxPeriodMs)} ms against observed average ${Math.round(averagePeriodMs)} ms`
          : null;
      return {
        id,
        extended: sorted[0]!.extended,
        dlc: dlcValues.size === 1 ? sorted[0]!.dlc : null,
        count: sorted.length,
        firstSeenMs: sorted[0]!.timestampMs,
        lastSeenMs: sorted.at(-1)!.timestampMs,
        averagePeriodMs,
        minPeriodMs,
        maxPeriodMs,
        jitterMs,
        frequencyHz: averagePeriodMs && averagePeriodMs > 0 ? 1000 / averagePeriodMs : null,
        droppedFrameEvidence: dropped,
        burst: minPeriodMs != null && averagePeriodMs != null && minPeriodMs < averagePeriodMs / 4,
        known: knownIds.has(id.toUpperCase()),
      } satisfies CanIdStatistics;
    })
    .sort((a, b) => b.count - a.count);
}
